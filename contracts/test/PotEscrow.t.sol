// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PotEscrow} from "../src/PotEscrow.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract PotEscrowTest is Test {
    MockUSDC internal usdc;
    PotEscrow internal escrow;

    address internal owner = address(0xA110);
    address internal resolver = address(0xBEEF);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xCA0);

    bytes32 internal constant GAME = keccak256("game-1");
    uint256 internal constant ANTE = 1_000_000; // 1 USDC (6 decimals)

    function setUp() public {
        usdc = new MockUSDC();

        vm.prank(owner);
        escrow = new PotEscrow(IERC20(address(usdc)), resolver);

        // Seed all three players with 100 USDC.
        usdc.mint(alice, 100 * ANTE);
        usdc.mint(bob, 100 * ANTE);
        usdc.mint(carol, 100 * ANTE);

        vm.prank(alice);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(carol);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // --- constructor / admin ---

    function test_constructor_setsOwnerAndResolver() public view {
        assertEq(escrow.owner(), owner);
        assertEq(escrow.resolver(), resolver);
        assertEq(address(escrow.token()), address(usdc));
    }

    function test_constructor_rejectsZeroToken() public {
        vm.expectRevert(PotEscrow.ZeroAddress.selector);
        new PotEscrow(IERC20(address(0)), resolver);
    }

    function test_constructor_rejectsZeroResolver() public {
        vm.expectRevert(PotEscrow.ZeroAddress.selector);
        new PotEscrow(IERC20(address(usdc)), address(0));
    }

    function test_setResolver_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(PotEscrow.NotOwner.selector);
        escrow.setResolver(alice);
    }

    function test_setResolver_updates() public {
        vm.prank(owner);
        escrow.setResolver(alice);
        assertEq(escrow.resolver(), alice);
    }

    function test_setOwner_updates() public {
        vm.prank(owner);
        escrow.setOwner(alice);
        assertEq(escrow.owner(), alice);
    }

    // --- createGame ---

    function test_createGame_onlyResolver() public {
        vm.prank(alice);
        vm.expectRevert(PotEscrow.NotResolver.selector);
        escrow.createGame(GAME, ANTE);
    }

    function test_createGame_stores() public {
        vm.prank(resolver);
        escrow.createGame(GAME, ANTE);
        (uint256 ante_, uint256 pot, uint256 createdAt, bool resolved) = escrow.gameInfo(GAME);
        assertEq(ante_, ANTE);
        assertEq(pot, 0);
        assertEq(createdAt, block.timestamp);
        assertFalse(resolved);
    }

    function test_createGame_rejectsDuplicate() public {
        vm.prank(resolver);
        escrow.createGame(GAME, ANTE);
        vm.prank(resolver);
        vm.expectRevert(PotEscrow.GameExists.selector);
        escrow.createGame(GAME, ANTE);
    }

    function test_createGame_rejectsZeroAnte() public {
        vm.prank(resolver);
        vm.expectRevert(PotEscrow.ZeroAnte.selector);
        escrow.createGame(GAME, 0);
    }

    // --- ante ---

    function test_ante_transfersAndMarksPaid() public {
        vm.prank(resolver);
        escrow.createGame(GAME, ANTE);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        escrow.ante(GAME);

        assertEq(usdc.balanceOf(alice), aliceBefore - ANTE);
        assertEq(usdc.balanceOf(address(escrow)), ANTE);
        assertTrue(escrow.paid(GAME, alice));

        (, uint256 pot,,) = escrow.gameInfo(GAME);
        assertEq(pot, ANTE);
    }

    function test_ante_rejectsDoublePay() public {
        vm.prank(resolver);
        escrow.createGame(GAME, ANTE);
        vm.prank(alice);
        escrow.ante(GAME);
        vm.prank(alice);
        vm.expectRevert(PotEscrow.AlreadyPaid.selector);
        escrow.ante(GAME);
    }

    function test_ante_rejectsMissingGame() public {
        vm.prank(alice);
        vm.expectRevert(PotEscrow.GameMissing.selector);
        escrow.ante(GAME);
    }

    function test_ante_rejectsAfterResolve() public {
        vm.prank(resolver);
        escrow.createGame(GAME, ANTE);
        vm.prank(alice);
        escrow.ante(GAME);

        address[] memory winners = new address[](1);
        winners[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = ANTE;

        vm.prank(resolver);
        escrow.resolve(GAME, winners, amounts);

        vm.prank(bob);
        vm.expectRevert(PotEscrow.GameAlreadyResolved.selector);
        escrow.ante(GAME);
    }

    // --- resolve ---

    function test_resolve_paysWinners() public {
        _antesAliceBobCarol();

        address[] memory winners = new address[](2);
        winners[0] = alice;
        winners[1] = bob;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 2 * ANTE;
        amounts[1] = ANTE;

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);

        vm.prank(resolver);
        escrow.resolve(GAME, winners, amounts);

        assertEq(usdc.balanceOf(alice), aliceBefore + 2 * ANTE);
        assertEq(usdc.balanceOf(bob), bobBefore + ANTE);
        assertEq(usdc.balanceOf(address(escrow)), 0);

        (, uint256 pot,, bool resolved) = escrow.gameInfo(GAME);
        assertEq(pot, 0);
        assertTrue(resolved);
    }

    function test_resolve_onlyResolver() public {
        _antesAliceBobCarol();
        address[] memory winners = new address[](1);
        winners[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 3 * ANTE;

        vm.prank(alice);
        vm.expectRevert(PotEscrow.NotResolver.selector);
        escrow.resolve(GAME, winners, amounts);
    }

    function test_resolve_sumMustMatch() public {
        _antesAliceBobCarol();
        address[] memory winners = new address[](1);
        winners[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 2 * ANTE; // pot is 3 * ANTE; sum off

        vm.prank(resolver);
        vm.expectRevert(PotEscrow.AmountMismatch.selector);
        escrow.resolve(GAME, winners, amounts);
    }

    function test_resolve_lengthsMustMatch() public {
        _antesAliceBobCarol();
        address[] memory winners = new address[](2);
        winners[0] = alice;
        winners[1] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 3 * ANTE;

        vm.prank(resolver);
        vm.expectRevert(PotEscrow.LengthMismatch.selector);
        escrow.resolve(GAME, winners, amounts);
    }

    function test_resolve_cantResolveTwice() public {
        _antesAliceBobCarol();
        address[] memory winners = new address[](1);
        winners[0] = alice;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 3 * ANTE;

        vm.prank(resolver);
        escrow.resolve(GAME, winners, amounts);

        vm.prank(resolver);
        vm.expectRevert(PotEscrow.GameAlreadyResolved.selector);
        escrow.resolve(GAME, winners, amounts);
    }

    // --- refund ---

    function test_refund_returnsAntes() public {
        _antesAliceBobCarol();

        address[] memory players = new address[](3);
        players[0] = alice;
        players[1] = bob;
        players[2] = carol;

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(resolver);
        escrow.refund(GAME, players);

        assertEq(usdc.balanceOf(alice), aliceBefore + ANTE);
        assertFalse(escrow.paid(GAME, alice));
        (, uint256 pot,, bool resolved) = escrow.gameInfo(GAME);
        assertEq(pot, 0);
        assertTrue(resolved); // full refund marks resolved
    }

    function test_refund_partialKeepsGameOpen() public {
        _antesAliceBobCarol();

        address[] memory players = new address[](1);
        players[0] = carol;

        vm.prank(resolver);
        escrow.refund(GAME, players);

        (, uint256 pot,, bool resolved) = escrow.gameInfo(GAME);
        assertEq(pot, 2 * ANTE);
        assertFalse(resolved);
        assertFalse(escrow.paid(GAME, carol));
        assertTrue(escrow.paid(GAME, alice));
    }

    function test_refund_rejectsUnpaid() public {
        _antesAliceBobCarol();
        address[] memory players = new address[](1);
        players[0] = address(0xDEAD); // never anted

        vm.prank(resolver);
        vm.expectRevert(PotEscrow.UnpaidPlayer.selector);
        escrow.refund(GAME, players);
    }

    function test_refund_onlyResolver() public {
        _antesAliceBobCarol();
        address[] memory players = new address[](1);
        players[0] = alice;

        vm.prank(alice);
        vm.expectRevert(PotEscrow.NotResolver.selector);
        escrow.refund(GAME, players);
    }

    // --- selfRefund ---

    function test_selfRefund_beforeTimeoutReverts() public {
        _antesAliceBobCarol();
        vm.prank(alice);
        vm.expectRevert(PotEscrow.TimeoutNotReached.selector);
        escrow.selfRefund(GAME);
    }

    function test_selfRefund_afterTimeoutReturnsAnte() public {
        _antesAliceBobCarol();
        vm.warp(block.timestamp + 1 hours + 1);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        escrow.selfRefund(GAME);

        assertEq(usdc.balanceOf(alice), aliceBefore + ANTE);
        assertFalse(escrow.paid(GAME, alice));
        (, uint256 pot,,) = escrow.gameInfo(GAME);
        assertEq(pot, 2 * ANTE);
    }

    function test_selfRefund_lastPayerClosesGame() public {
        vm.prank(resolver);
        escrow.createGame(GAME, ANTE);
        vm.prank(alice);
        escrow.ante(GAME);

        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(alice);
        escrow.selfRefund(GAME);

        (, uint256 pot,, bool resolved) = escrow.gameInfo(GAME);
        assertEq(pot, 0);
        assertTrue(resolved);
    }

    function test_selfRefund_unpaidReverts() public {
        _antesAliceBobCarol();
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(address(0xDEAD));
        vm.expectRevert(PotEscrow.UnpaidPlayer.selector);
        escrow.selfRefund(GAME);
    }

    // --- helpers ---

    function _antesAliceBobCarol() internal {
        vm.prank(resolver);
        escrow.createGame(GAME, ANTE);
        vm.prank(alice);
        escrow.ante(GAME);
        vm.prank(bob);
        escrow.ante(GAME);
        vm.prank(carol);
        escrow.ante(GAME);
    }
}
