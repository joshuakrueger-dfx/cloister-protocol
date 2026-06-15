// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

// Package onchain submits a shielded deposit directly to a public EVM RPC — no relayer.
// Used by the native mobile deposit path (the app reaches the public chain even when no
// relayer/LAN is reachable) and verifiable via cmd/depositdirect.
package onchain

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"

	"github.com/consensys/gnark-crypto/ecc/bn254/fr"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/prover"
	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
)

const poolABIJSON = `[
 {"inputs":[{"name":"","type":"uint256"}],"name":"laneRoot","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
 {"inputs":[{"name":"","type":"uint256"}],"name":"laneNextIndex","outputs":[{"name":"","type":"uint32"}],"stateMutability":"view","type":"function"},
 {"inputs":[
   {"components":[{"name":"a","type":"uint256[2]"},{"name":"b","type":"uint256[2][2]"},{"name":"c","type":"uint256[2]"}],"name":"proof","type":"tuple"},
   {"name":"oldRoot","type":"uint256"},{"name":"newRoot","type":"uint256"},{"name":"associationRoot","type":"uint256"},
   {"name":"inputNullifiers","type":"uint256[2]"},{"name":"outputCommitments","type":"uint256[2]"},
   {"components":[{"name":"recipient","type":"address"},{"name":"extAmount","type":"int256"},{"name":"relayer","type":"address"},{"name":"fee","type":"uint256"},{"name":"encryptedOutput1","type":"bytes"},{"name":"encryptedOutput2","type":"bytes"}],"name":"extData","type":"tuple"}
 ],"name":"transact","outputs":[],"stateMutability":"nonpayable","type":"function"}
]`

const erc20ABIJSON = `[
 {"inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"name":"mint","outputs":[],"stateMutability":"nonpayable","type":"function"},
 {"inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}
]`

// Proof / ExtData mirror the Solidity tuples (field names = capitalized ABI component names).
type Proof struct {
	A [2]*big.Int
	B [2][2]*big.Int
	C [2]*big.Int
}
type ExtData struct {
	Recipient        common.Address
	ExtAmount        *big.Int
	Relayer          common.Address
	Fee              *big.Int
	EncryptedOutput1 []byte
	EncryptedOutput2 []byte
}

type Config struct {
	RPC, PoolAddr, TokenAddr, DeployerKey, Amount, OwnerPriv string
}
type Result struct {
	TxHash  string
	ProveMs int64
}

func hexToBig(s string) *big.Int {
	s = strings.TrimPrefix(strings.TrimPrefix(s, "0x"), "0X")
	n, _ := new(big.Int).SetString(s, 16)
	if n == nil {
		n = big.NewInt(0)
	}
	return n
}

// DepositAndSubmit builds + proves a deposit on-device and broadcasts it straight to the
// public RPC (mint test token → approve → transact). Requires an EMPTY pool (the device
// uses the constant empty-tree insertion context — no event sync needed).
func DepositAndSubmit(p *prover.Prover, cfg Config) (Result, error) {
	ctx := context.Background()
	client, err := ethclient.DialContext(ctx, cfg.RPC)
	if err != nil {
		return Result{}, fmt.Errorf("dial: %w", err)
	}
	defer client.Close()

	chainID, err := client.ChainID(ctx)
	if err != nil {
		return Result{}, fmt.Errorf("chainid: %w", err)
	}
	key, err := crypto.HexToECDSA(strings.TrimPrefix(cfg.DeployerKey, "0x"))
	if err != nil {
		return Result{}, fmt.Errorf("key: %w", err)
	}
	from := crypto.PubkeyToAddress(key.PublicKey)

	poolABI, _ := abi.JSON(strings.NewReader(poolABIJSON))
	erc20ABI, _ := abi.JSON(strings.NewReader(erc20ABIJSON))
	poolAddr := common.HexToAddress(cfg.PoolAddr)
	tokenAddr := common.HexToAddress(cfg.TokenAddr)
	poolC := bind.NewBoundContract(poolAddr, poolABI, client, client, client)
	tokenC := bind.NewBoundContract(tokenAddr, erc20ABI, client, client, client)

	// 1) read the (empty) pool context
	var rootOut []interface{}
	if err := poolC.Call(&bind.CallOpts{Context: ctx}, &rootOut, "laneRoot", big.NewInt(0)); err != nil {
		return Result{}, fmt.Errorf("laneRoot: %w", err)
	}
	var nextOut []interface{}
	if err := poolC.Call(&bind.CallOpts{Context: ctx}, &nextOut, "laneNextIndex", big.NewInt(0)); err != nil {
		return Result{}, fmt.Errorf("laneNextIndex: %w", err)
	}
	if nextOut[0].(uint32) != 0 {
		return Result{}, fmt.Errorf("pool not empty (laneNextIndex=%d); native direct deposit supports a fresh pool", nextOut[0].(uint32))
	}
	onchainRoot := rootOut[0].(*big.Int)

	// 2) empty-tree insertion context (constants), extDataHash = keccak(extData) % FIELD
	amount, _ := new(big.Int).SetString(cfg.Amount, 10)
	ext := ExtData{Recipient: common.Address{}, ExtAmount: amount, Relayer: common.Address{}, Fee: big.NewInt(0), EncryptedOutput1: []byte{}, EncryptedOutput2: []byte{}}
	extABI := poolABI.Methods["transact"].Inputs[6] // the extData tuple arg
	encoded, err := abi.Arguments{{Type: extABI.Type}}.Pack(ext)
	if err != nil {
		return Result{}, fmt.Errorf("pack extData: %w", err)
	}
	extHash := new(big.Int).Mod(new(big.Int).SetBytes(crypto.Keccak256(encoded)), fr.Modulus())

	tree := zk.NewTree()
	pairEls, _ := tree.PairPath(0)
	ownerPriv, _ := zk.ParseFE(cfg.OwnerPriv)
	amtFe, _ := zk.ParseFE(cfg.Amount)
	rootFe, _ := zk.ParseFE(onchainRoot.String())
	extFe, _ := zk.ParseFE(extHash.String())

	t0 := time.Now()
	res, err := p.ProveWitness(ptrWI(zk.ToWitnessInput(zk.BuildDepositAssignment(zk.DepositParams{
		Amount: amtFe, OwnerPub: zk.PubKey(ownerPriv), Root: rootFe,
		PairIndex: 0, PairPathEls: pairEls, ExtDataHash: extFe,
	}))))
	if err != nil {
		return Result{}, fmt.Errorf("prove: %w", err)
	}
	proveMs := time.Since(t0).Milliseconds()

	// 3) mint test token → approve → transact (sequential, each mined before the next)
	opts, err := bind.NewKeyedTransactorWithChainID(key, chainID)
	if err != nil {
		return Result{}, err
	}
	opts.Context = ctx
	// Fixed gas limit → skip the eth_estimateGas pre-flight, which on a lagging public RPC
	// can simulate against pre-approve state and falsely revert ("allowance"). The tx itself
	// executes against the mined chain where the allowance is set.
	opts.GasLimit = 900000
	send := func(c *bind.BoundContract, method string, args ...interface{}) error {
		tx, err := c.Transact(opts, method, args...)
		if err != nil {
			return fmt.Errorf("%s: %w", method, err)
		}
		rc, err := bind.WaitMined(ctx, client, tx)
		if err != nil {
			return fmt.Errorf("%s wait: %w", method, err)
		}
		if rc.Status != 1 {
			return fmt.Errorf("%s reverted (tx %s)", method, tx.Hash().Hex())
		}
		return nil
	}
	if err := send(tokenC, "mint", from, amount); err != nil {
		return Result{}, err
	}
	if err := send(tokenC, "approve", poolAddr, amount); err != nil {
		return Result{}, err
	}

	ps := res.Public
	proof := Proof{
		A: [2]*big.Int{hexToBig(res.A[0]), hexToBig(res.A[1])},
		B: [2][2]*big.Int{{hexToBig(res.B[0][0]), hexToBig(res.B[0][1])}, {hexToBig(res.B[1][0]), hexToBig(res.B[1][1])}},
		C: [2]*big.Int{hexToBig(res.C[0]), hexToBig(res.C[1])},
	}
	tx, err := poolC.Transact(opts, "transact",
		proof, hexToBig(ps[0]), hexToBig(ps[7]), hexToBig(ps[9]),
		[2]*big.Int{hexToBig(ps[3]), hexToBig(ps[4])},
		[2]*big.Int{hexToBig(ps[5]), hexToBig(ps[6])},
		ext,
	)
	if err != nil {
		return Result{}, fmt.Errorf("transact: %w", err)
	}
	rc, err := bind.WaitMined(ctx, client, tx)
	if err != nil {
		return Result{}, fmt.Errorf("transact wait: %w", err)
	}
	if rc.Status != 1 {
		return Result{}, fmt.Errorf("transact reverted (tx %s)", tx.Hash().Hex())
	}
	return Result{TxHash: tx.Hash().Hex(), ProveMs: proveMs}, nil
}

func ptrWI(w zk.WitnessInput) *zk.WitnessInput { return &w }
