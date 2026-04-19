// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Minimal interface for Base's canonical SpendPermissionManager.
/// Deployed at 0xf85210B21cC50302F477BA56686d2019dC9b67Ad on Base + Base Sepolia.
interface ISpendPermissionManager {
    struct SpendPermission {
        address account;
        address spender;
        address token;
        uint160 allowance;
        uint48 period;
        uint48 start;
        uint48 end;
        uint256 salt;
        bytes extraData;
    }
    function spend(SpendPermission calldata permission, uint160 value) external;
    function approveWithSignature(SpendPermission calldata permission, bytes calldata signature) external;
}

/// @title PotEscrow
/// @notice Generic per-game pot escrow for multi-player wager games. One
///         resolver (the game server) creates games, records antes as
///         players send token in, then distributes the pot when the game
///         finishes. Players can self-refund if the resolver goes silent
///         past the timeout.
contract PotEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    ISpendPermissionManager public immutable spendPermissionManager;
    address public owner;
    address public resolver;

    uint256 public constant SELF_REFUND_DELAY = 1 hours;

    struct Game {
        uint256 ante;
        uint256 potBalance;
        uint256 createdAt;
        bool resolved;
    }

    mapping(bytes32 => Game) public games;
    // paid[gameId][player] = true once the player has anted and not refunded.
    mapping(bytes32 => mapping(address => bool)) public paid;

    event Created(bytes32 indexed gameId, uint256 ante);
    event Anted(bytes32 indexed gameId, address indexed player, uint256 amount);
    event Resolved(bytes32 indexed gameId, address[] winners, uint256[] amounts);
    event Refunded(bytes32 indexed gameId, address[] players, uint256 amountEach);
    event SelfRefunded(bytes32 indexed gameId, address indexed player, uint256 amount);
    event ResolverChanged(address indexed previous, address indexed next);
    event OwnerChanged(address indexed previous, address indexed next);

    error NotOwner();
    error NotResolver();
    error GameExists();
    error GameMissing();
    error GameAlreadyResolved();
    error AlreadyPaid();
    error UnpaidPlayer();
    error TimeoutNotReached();
    error AmountMismatch();
    error LengthMismatch();
    error ZeroAnte();
    error ZeroAddress();
    error WrongPermissionToken();
    error WrongPermissionSpender();

    constructor(
        IERC20 token_,
        ISpendPermissionManager spendPermissionManager_,
        address resolver_
    ) {
        if (address(token_) == address(0)) revert ZeroAddress();
        if (address(spendPermissionManager_) == address(0)) revert ZeroAddress();
        if (resolver_ == address(0)) revert ZeroAddress();
        token = token_;
        spendPermissionManager = spendPermissionManager_;
        resolver = resolver_;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyResolver() {
        if (msg.sender != resolver) revert NotResolver();
        _;
    }

    /// @notice Transfer ownership.
    function setOwner(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit OwnerChanged(owner, next);
        owner = next;
    }

    /// @notice Point to a different resolver signer.
    function setResolver(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit ResolverChanged(resolver, next);
        resolver = next;
    }

    /// @notice Create a game. `gameId` is chosen off-chain (recommend
    ///         keccak256 of a (roomCode, roundNonce) tuple).
    function createGame(bytes32 gameId, uint256 ante_) external onlyResolver {
        if (ante_ == 0) revert ZeroAnte();
        Game storage g = games[gameId];
        if (g.createdAt != 0) revert GameExists();
        g.ante = ante_;
        g.createdAt = block.timestamp;
        emit Created(gameId, ante_);
    }

    /// @notice Ante into a game. Caller must have approved `ante` tokens
    ///         to this contract.
    function ante(bytes32 gameId) external nonReentrant {
        Game storage g = games[gameId];
        if (g.createdAt == 0) revert GameMissing();
        if (g.resolved) revert GameAlreadyResolved();
        if (paid[gameId][msg.sender]) revert AlreadyPaid();
        paid[gameId][msg.sender] = true;
        g.potBalance += g.ante;
        token.safeTransferFrom(msg.sender, address(this), g.ante);
        emit Anted(gameId, msg.sender, g.ante);
    }

    /// @notice Resolver-only: ante on behalf of a player using a
    ///         pre-approved Base Account Spend Permission. The permission
    ///         must name this contract as its spender and the game's
    ///         token as its token. SpendPermissionManager.spend pulls the
    ///         ante directly into this contract.
    function anteFor(
        bytes32 gameId,
        ISpendPermissionManager.SpendPermission calldata permission
    ) external onlyResolver nonReentrant {
        Game storage g = games[gameId];
        if (g.createdAt == 0) revert GameMissing();
        if (g.resolved) revert GameAlreadyResolved();
        if (paid[gameId][permission.account]) revert AlreadyPaid();
        if (permission.token != address(token)) revert WrongPermissionToken();
        if (permission.spender != address(this)) revert WrongPermissionSpender();

        paid[gameId][permission.account] = true;
        g.potBalance += g.ante;

        spendPermissionManager.spend(permission, uint160(g.ante));

        emit Anted(gameId, permission.account, g.ante);
    }

    /// @notice Distribute the pot to winners. Sum(amounts) must equal
    ///         potBalance exactly. Marks the game resolved.
    function resolve(bytes32 gameId, address[] calldata winners, uint256[] calldata amounts)
        external
        onlyResolver
        nonReentrant
    {
        Game storage g = games[gameId];
        if (g.createdAt == 0) revert GameMissing();
        if (g.resolved) revert GameAlreadyResolved();
        if (winners.length != amounts.length) revert LengthMismatch();

        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
        if (total != g.potBalance) revert AmountMismatch();

        g.resolved = true;
        g.potBalance = 0;

        for (uint256 i = 0; i < winners.length; i++) {
            if (amounts[i] > 0) {
                token.safeTransfer(winners[i], amounts[i]);
            }
        }

        emit Resolved(gameId, winners, amounts);
    }

    /// @notice Refund specific players' antes (e.g. drop-before-start or
    ///         host void). Game is marked resolved once potBalance hits 0.
    function refund(bytes32 gameId, address[] calldata players) external onlyResolver nonReentrant {
        Game storage g = games[gameId];
        if (g.createdAt == 0) revert GameMissing();
        if (g.resolved) revert GameAlreadyResolved();
        uint256 anteAmt = g.ante;
        uint256 total = anteAmt * players.length;
        if (total > g.potBalance) revert AmountMismatch();

        g.potBalance -= total;
        if (g.potBalance == 0) {
            g.resolved = true;
        }

        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            if (!paid[gameId][p]) revert UnpaidPlayer();
            paid[gameId][p] = false;
            token.safeTransfer(p, anteAmt);
        }

        emit Refunded(gameId, players, anteAmt);
    }

    /// @notice Player-triggered escape hatch: if the resolver hasn't
    ///         settled the game within SELF_REFUND_DELAY, an unrefunded
    ///         paid player can pull their ante back directly.
    function selfRefund(bytes32 gameId) external nonReentrant {
        Game storage g = games[gameId];
        if (g.createdAt == 0) revert GameMissing();
        if (g.resolved) revert GameAlreadyResolved();
        if (block.timestamp < g.createdAt + SELF_REFUND_DELAY) revert TimeoutNotReached();
        if (!paid[gameId][msg.sender]) revert UnpaidPlayer();

        paid[gameId][msg.sender] = false;
        uint256 anteAmt = g.ante;
        g.potBalance -= anteAmt;
        if (g.potBalance == 0) {
            g.resolved = true;
        }

        token.safeTransfer(msg.sender, anteAmt);
        emit SelfRefunded(gameId, msg.sender, anteAmt);
    }

    /// @notice Convenience view.
    function gameInfo(bytes32 gameId)
        external
        view
        returns (uint256 ante_, uint256 potBalance_, uint256 createdAt_, bool resolved_)
    {
        Game storage g = games[gameId];
        return (g.ante, g.potBalance, g.createdAt, g.resolved);
    }
}
