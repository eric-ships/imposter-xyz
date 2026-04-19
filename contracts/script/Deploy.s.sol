// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PotEscrow, ISpendPermissionManager} from "../src/PotEscrow.sol";

/// @notice forge script script/Deploy.s.sol:Deploy --rpc-url base_sepolia --broadcast --verify
///         Required env:
///           USDC_ADDRESS                        - token to escrow (Base Sepolia USDC = 0x036CbD...)
///           SPEND_PERMISSION_MANAGER_ADDRESS    - Base SPM (0xf85210B21cC50302F477BA56686d2019dC9b67Ad on Base + Base Sepolia)
///           RESOLVER_ADDRESS                    - CDP server-wallet address
///           PRIVATE_KEY                         - deployer
contract Deploy is Script {
    function run() external returns (PotEscrow escrow) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address spm = vm.envAddress("SPEND_PERMISSION_MANAGER_ADDRESS");
        address resolverAddr = vm.envAddress("RESOLVER_ADDRESS");
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        escrow = new PotEscrow(
            IERC20(usdc),
            ISpendPermissionManager(spm),
            resolverAddr
        );
        vm.stopBroadcast();

        console2.log("PotEscrow deployed at:", address(escrow));
        console2.log("  token:   ", usdc);
        console2.log("  spm:     ", spm);
        console2.log("  resolver:", resolverAddr);
    }
}
