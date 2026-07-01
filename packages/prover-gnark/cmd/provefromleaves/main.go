// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

// Command provefromleaves verifies the relayer-less fallback path end-to-end: it fetches
// the pool's commitments (leaves) from chain, proves a deposit via mobile.ProveDepositFromLeaves
// (the exact native function the wallet calls — pure gnark, no go-ethereum), checks the
// proof's root against the on-chain laneRoot, then broadcasts transact() and confirms it
// lands. This mirrors the wallet's fallback (ethers getLogs → native prove → ethers submit).
//
// usage: provefromleaves <keysDir> <rpc> <deployerKey> <pool> <amount> <ownerPriv> <fromBlock>
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"

	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/logger"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/mobile"
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

type proof struct {
	A      [2]string    `json:"a"`
	B      [2][2]string `json:"b"`
	C      [2]string    `json:"c"`
	Public [10]string   `json:"publicSignals"`
}
type extDataT struct {
	Recipient        common.Address
	ExtAmount        *big.Int
	Relayer          common.Address
	Fee              *big.Int
	EncryptedOutput1 []byte
	EncryptedOutput2 []byte
}

func hexToBig(s string) *big.Int {
	n, _ := new(big.Int).SetString(strings.TrimPrefix(s, "0x"), 16)
	if n == nil {
		n = big.NewInt(0)
	}
	return n
}

func main() {
	if len(os.Args) < 8 {
		fmt.Fprintln(os.Stderr, "usage: provefromleaves <keysDir> <rpc> <deployerKey> <pool> <amount> <ownerPriv> <fromBlock>")
		os.Exit(1)
	}
	logger.Disable()
	keysDir, rpc, key, poolAddr, amount, ownerPriv := os.Args[1], os.Args[2], os.Args[3], os.Args[4], os.Args[5], os.Args[6]
	fromBlock, _ := strconv.ParseUint(os.Args[7], 10, 64)

	if err := mobile.Init(keysDir); err != nil {
		panic(err)
	}
	ctx := context.Background()
	client, err := ethclient.DialContext(ctx, rpc)
	if err != nil {
		panic(err)
	}
	chainID, _ := client.ChainID(ctx)
	pk, _ := crypto.HexToECDSA(strings.TrimPrefix(key, "0x"))
	from := crypto.PubkeyToAddress(pk.PublicKey)
	poolABI, _ := abi.JSON(strings.NewReader(poolABIJSON))
	pool := common.HexToAddress(poolAddr)
	c := bind.NewBoundContract(pool, poolABI, client, client, client)

	// on-chain laneRoot(0)
	var rootOut []interface{}
	if err := c.Call(&bind.CallOpts{Context: ctx}, &rootOut, "laneRoot", big.NewInt(0)); err != nil {
		panic(err)
	}
	onchainRoot := rootOut[0].(*big.Int)
	var nextOut []interface{}
	if err := c.Call(&bind.CallOpts{Context: ctx}, &nextOut, "laneNextIndex", big.NewInt(0)); err != nil {
		panic(err)
	}
	expected := int(nextOut[0].(uint32)) // on-chain leaf count — the completeness target

	// fetch a COMPLETE leaf set — mirrors the wallet's fallback: try each getLogs RPC
	// (tenderly first; publicnode drops results) until the count matches laneNextIndex.
	ev := poolABI.Events["NewCommitment"]
	rpcs := []string{"https://base-sepolia.gateway.tenderly.co", "https://base-sepolia-rpc.publicnode.com", rpc}
	var leafStrs []string
	for _, r := range rpcs {
		cl, err := ethclient.DialContext(ctx, r)
		if err != nil {
			continue
		}
		latest, err := cl.BlockNumber(ctx)
		if err != nil {
			continue
		}
		type leaf struct {
			idx uint32
			c   *big.Int
		}
		var leaves []leaf
		ok := true
		for start := fromBlock; start <= latest; {
			end := start + 40000
			if end > latest {
				end = latest
			}
			logs, err := cl.FilterLogs(ctx, ethereum.FilterQuery{FromBlock: new(big.Int).SetUint64(start), ToBlock: new(big.Int).SetUint64(end), Addresses: []common.Address{pool}, Topics: [][]common.Hash{{ev.ID}}})
			if err != nil {
				ok = false
				break
			}
			for _, lg := range logs {
				vals, _ := ev.Inputs.NonIndexed().Unpack(lg.Data)
				leaves = append(leaves, leaf{idx: vals[0].(uint32), c: new(big.Int).SetBytes(lg.Topics[1].Bytes())})
			}
			if end == latest {
				break
			}
			start = end + 1
		}
		if !ok || len(leaves) != expected {
			fmt.Printf("  %s → %d leaves (need %d), skip\n", strings.TrimPrefix(r, "https://"), len(leaves), expected)
			continue
		}
		sort.Slice(leaves, func(i, j int) bool { return leaves[i].idx < leaves[j].idx })
		leafStrs = make([]string, len(leaves))
		for i, l := range leaves {
			leafStrs[i] = l.c.String()
		}
		fmt.Printf("  %s → %d leaves (complete) ✓\n", strings.TrimPrefix(r, "https://"), len(leafStrs))
		break
	}
	if len(leafStrs) != expected {
		fmt.Printf("no RPC returned all %d commitments\n", expected)
		os.Exit(1)
	}
	fmt.Printf("complete leaf set: %d; on-chain laneRoot(0)=%s…\n", len(leafStrs), onchainRoot.String()[:16])

	// extData + extDataHash (identical to the contract's keccak%FIELD). WP-A1: domain-separate
	// by chainId + lane (deposits use transact → lane 0), matching ShieldedPool._transact's
	// keccak256(abi.encode(extData, block.chainid, lane)).
	ext := extDataT{Recipient: common.Address{}, ExtAmount: mustBig(amount), Relayer: common.Address{}, Fee: big.NewInt(0), EncryptedOutput1: []byte{}, EncryptedOutput2: []byte{}}
	extArg := poolABI.Methods["transact"].Inputs[6]
	uint256T, _ := abi.NewType("uint256", "", nil)
	encoded, _ := abi.Arguments{{Type: extArg.Type}, {Type: uint256T}, {Type: uint256T}}.Pack(ext, chainID, big.NewInt(0))
	extDataHash := new(big.Int).Mod(new(big.Int).SetBytes(crypto.Keccak256(encoded)), fr.Modulus())

	// >>> the function under test: native prove from leaves <<<
	params, _ := json.Marshal(map[string]interface{}{"amount": amount, "ownerPriv": ownerPriv, "leaves": leafStrs, "extDataHash": extDataHash.String()})
	t0 := time.Now()
	outJSON, err := mobile.ProveDepositFromLeaves(string(params))
	if err != nil {
		fmt.Println("PROVE ERROR:", err)
		os.Exit(1)
	}
	var pr proof
	json.Unmarshal([]byte(outJSON), &pr)
	fmt.Printf("proved in %dms\n", time.Since(t0).Milliseconds())

	// CHECK 1: the proof's old-root must equal the on-chain laneRoot(0)
	if hexToBig(pr.Public[0]).Cmp(onchainRoot) != 0 {
		fmt.Printf("ROOT MISMATCH: proof root=%s != onchain=%s\n", hexToBig(pr.Public[0]), onchainRoot)
		os.Exit(1)
	}
	fmt.Println("CHECK 1 ok: proof root == on-chain laneRoot(0)")

	// CHECK 2: submit transact() and confirm it lands
	opts, _ := bind.NewKeyedTransactorWithChainID(pk, chainID)
	opts.Context = ctx
	opts.GasLimit = 900000
	nonce, _ := client.PendingNonceAt(ctx, from)
	opts.Nonce = new(big.Int).SetUint64(nonce)
	ps := pr.Public
	prf := struct {
		A [2]*big.Int
		B [2][2]*big.Int
		C [2]*big.Int
	}{
		A: [2]*big.Int{hexToBig(pr.A[0]), hexToBig(pr.A[1])},
		B: [2][2]*big.Int{{hexToBig(pr.B[0][0]), hexToBig(pr.B[0][1])}, {hexToBig(pr.B[1][0]), hexToBig(pr.B[1][1])}},
		C: [2]*big.Int{hexToBig(pr.C[0]), hexToBig(pr.C[1])},
	}
	tx, err := c.Transact(opts, "transact", prf, hexToBig(ps[0]), hexToBig(ps[7]), hexToBig(ps[9]),
		[2]*big.Int{hexToBig(ps[3]), hexToBig(ps[4])}, [2]*big.Int{hexToBig(ps[5]), hexToBig(ps[6])}, ext)
	if err != nil {
		fmt.Println("TRANSACT ERROR:", err)
		os.Exit(1)
	}
	rc, err := bind.WaitMined(ctx, client, tx)
	if err != nil {
		panic(err)
	}
	if rc.Status != 1 {
		fmt.Println("REVERTED:", tx.Hash().Hex())
		os.Exit(1)
	}
	fmt.Printf("CHECK 2 ok: deposit landed via ProveDepositFromLeaves → https://sepolia.basescan.org/tx/%s\n", tx.Hash().Hex())
}

func mustBig(s string) *big.Int { n, _ := new(big.Int).SetString(s, 10); return n }
