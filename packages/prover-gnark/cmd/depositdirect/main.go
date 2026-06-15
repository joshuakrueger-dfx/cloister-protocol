// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

// Command depositdirect verifies the native direct-to-RPC deposit path (onchain pkg)
// against a real chain BEFORE the mobile build — it does exactly what the on-device
// native deposit will do: prove + mint/approve/transact straight to the public RPC.
//
// usage: depositdirect <keysDir> <rpc> <deployerKey> <pool> <token> <amount> <ownerPriv>
package main

import (
	"fmt"
	"os"
	"strconv"

	"github.com/consensys/gnark/logger"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/onchain"
	"github.com/DFXswiss/cloister-protocol/prover-gnark/prover"
)

func main() {
	if len(os.Args) < 8 {
		fmt.Fprintln(os.Stderr, "usage: depositdirect <keysDir> <rpc> <deployerKey> <pool> <token> <amount> <ownerPriv> [fromBlock]")
		os.Exit(1)
	}
	logger.Disable()
	p, err := prover.Load(os.Args[1])
	if err != nil {
		panic(err)
	}
	var fromBlock uint64
	if len(os.Args) >= 9 {
		fromBlock, _ = strconv.ParseUint(os.Args[8], 10, 64)
	}
	res, err := onchain.DepositAndSubmit(p, onchain.Config{
		RPC:         os.Args[2],
		DeployerKey: os.Args[3],
		PoolAddr:    os.Args[4],
		TokenAddr:   os.Args[5],
		Amount:      os.Args[6],
		OwnerPriv:   os.Args[7],
		FromBlock:   fromBlock,
	})
	if err != nil {
		fmt.Println("ERROR:", err)
		os.Exit(1)
	}
	fmt.Printf("✓ deposit landed: prove %dms, tx https://sepolia.basescan.org/tx/%s\n", res.ProveMs, res.TxHash)
}
