// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PotEscrow} from "../src/PotEscrow.sol";

/// @notice forge script script/Deploy.s.sol:Deploy --rpc-url base_sepolia --broadcast --verify
///         Required env: USDC_ADDRESS, RESOLVER_ADDRESS, PRIVATE_KEY (deployer)
contract Deploy is Script {
    function run() external returns (PotEscrow escrow) {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address resolverAddr = vm.envAddress("RESOLVER_ADDRESS");
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        escrow = new PotEscrow(IERC20(usdc), resolverAddr);
        vm.stopBroadcast();

        console2.log("PotEscrow deployed at:", address(escrow));
        console2.log("  token:   ", usdc);
        console2.log("  resolver:", resolverAddr);
    }
}
