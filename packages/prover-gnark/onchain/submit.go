// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

// Package onchain submits a shielded deposit directly to a public EVM RPC — no relayer.
// Used by the native mobile deposit path (the app reaches the public chain even when no
// relayer/LAN is reachable) and verifiable via cmd/depositdirect.
package onchain

import (
	"context"
	"fmt"
	"math/big"
	"sort"
	"strings"
	"time"

	ethereum "github.com/ethereum/go-ethereum"
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
 {"anonymous":false,"inputs":[{"indexed":true,"name":"commitment","type":"uint256"},{"indexed":false,"name":"leafIndex","type":"uint32"},{"indexed":false,"name":"encryptedOutput","type":"bytes"}],"name":"NewCommitment","type":"event"},
 {"inputs":[
   {"components":[{"name":"a","type":"uint256[2]"},{"name":"b","type":"uint256[2][2]"},{"name":"c","type":"uint256[2]"}],"name":"proof","type":"tuple"},
   {"name":"oldRoot","type":"uint256"},{"name":"newRoot","type":"uint256"},{"name":"associationRoot","type":"uint256"},
   {"name":"inputNullifiers","type":"uint256[2]"},{"name":"outputCommitments","type":"uint256[2]"},
   {"components":[{"name":"recipient","type":"address"},{"name":"extAmount","type":"int256"},{"name":"relayer","type":"address"},{"name":"fee","type":"uint256"},{"name":"encryptedOutput1","type":"bytes"},{"name":"encryptedOutput2","type":"bytes"}],"name":"extData","type":"tuple"}
 ],"name":"transact","outputs":[],"stateMutability":"nonpayable","type":"function"}
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

// syncTree rebuilds the pool's Merkle tree from NewCommitment events so a deposit into a
// non-empty pool gets the correct insertion context. Bounded block range keeps eth_getLogs
// within public-RPC limits.
func syncTree(ctx context.Context, client *ethclient.Client, poolAddr common.Address, poolABI abi.ABI, tree *zk.Tree) error {
	ev := poolABI.Events["NewCommitment"]
	latest, err := client.BlockNumber(ctx)
	if err != nil {
		return err
	}
	var from uint64
	if latest > 4000 {
		from = latest - 4000
	}
	logs, err := client.FilterLogs(ctx, ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(from),
		ToBlock:   new(big.Int).SetUint64(latest),
		Addresses: []common.Address{poolAddr},
		Topics:    [][]common.Hash{{ev.ID}},
	})
	if err != nil {
		return err
	}
	type leaf struct {
		idx uint32
		c   *big.Int
	}
	var leaves []leaf
	for _, lg := range logs {
		if len(lg.Topics) < 2 {
			continue
		}
		vals, err := ev.Inputs.NonIndexed().Unpack(lg.Data)
		if err != nil {
			return err
		}
		leaves = append(leaves, leaf{idx: vals[0].(uint32), c: new(big.Int).SetBytes(lg.Topics[1].Bytes())})
	}
	sort.Slice(leaves, func(i, j int) bool { return leaves[i].idx < leaves[j].idx })
	for _, l := range leaves {
		var fe fr.Element
		fe.SetBigInt(l.c)
		tree.Insert(fe)
	}
	return nil
}

// DepositAndSubmit builds + proves a deposit on-device and broadcasts it straight to the
// public RPC. mint/approve are NOT done here — the sender is expected to already hold the
// token and a standing allowance (set up once), so a deposit is a SINGLE transaction.
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
	poolAddr := common.HexToAddress(cfg.PoolAddr)
	poolC := bind.NewBoundContract(poolAddr, poolABI, client, client, client)

	var rootOut, nextOut []interface{}
	if err := poolC.Call(&bind.CallOpts{Context: ctx}, &rootOut, "laneRoot", big.NewInt(0)); err != nil {
		return Result{}, fmt.Errorf("laneRoot: %w", err)
	}
	if err := poolC.Call(&bind.CallOpts{Context: ctx}, &nextOut, "laneNextIndex", big.NewInt(0)); err != nil {
		return Result{}, fmt.Errorf("laneNextIndex: %w", err)
	}
	nextIdx := nextOut[0].(uint32)
	onchainRoot := rootOut[0].(*big.Int)

	// current insertion context (sync the tree from events if the pool is non-empty)
	tree := zk.NewTree()
	if nextIdx > 0 {
		if err := syncTree(ctx, client, poolAddr, poolABI, tree); err != nil {
			return Result{}, fmt.Errorf("tree sync: %w", err)
		}
	}
	pairIndex := int(nextIdx) / 2
	pairEls, _ := tree.PairPath(pairIndex)

	amount, _ := new(big.Int).SetString(cfg.Amount, 10)
	ext := ExtData{Recipient: common.Address{}, ExtAmount: amount, Relayer: common.Address{}, Fee: big.NewInt(0), EncryptedOutput1: []byte{}, EncryptedOutput2: []byte{}}
	extArg := poolABI.Methods["transact"].Inputs[6]
	encoded, err := abi.Arguments{{Type: extArg.Type}}.Pack(ext)
	if err != nil {
		return Result{}, fmt.Errorf("pack extData: %w", err)
	}
	extHash := new(big.Int).Mod(new(big.Int).SetBytes(crypto.Keccak256(encoded)), fr.Modulus())

	ownerPriv, _ := zk.ParseFE(cfg.OwnerPriv)
	amtFe, _ := zk.ParseFE(cfg.Amount)
	rootFe, _ := zk.ParseFE(onchainRoot.String())
	extFe, _ := zk.ParseFE(extHash.String())

	t0 := time.Now()
	res, err := p.ProveWitness(ptrWI(zk.ToWitnessInput(zk.BuildDepositAssignment(zk.DepositParams{
		Amount: amtFe, OwnerPub: zk.PubKey(ownerPriv), Root: rootFe,
		PairIndex: pairIndex, PairPathEls: pairEls, ExtDataHash: extFe,
	}))))
	if err != nil {
		return Result{}, fmt.Errorf("prove: %w", err)
	}
	proveMs := time.Since(t0).Milliseconds()

	// single tx: transact (sender already holds token + standing allowance)
	opts, err := bind.NewKeyedTransactorWithChainID(key, chainID)
	if err != nil {
		return Result{}, err
	}
	opts.Context = ctx
	opts.GasLimit = 900000
	nonce, err := client.PendingNonceAt(ctx, from)
	if err != nil {
		return Result{}, fmt.Errorf("nonce: %w", err)
	}
	opts.Nonce = new(big.Int).SetUint64(nonce)

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
