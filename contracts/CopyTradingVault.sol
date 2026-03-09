// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CopyTradingVault
 * @notice Vault for copy-trading deposits on Avalanche. Users deposit USDC to fund
 *         future copy-trades. Withdraw returns funds to the user.
 * @dev Phase 1: deposit and withdraw only. Copy-trading logic to be added later.
 */
contract CopyTradingVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    mapping(address => uint256) public balanceOf;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);

    error ZeroAmount();
    error InsufficientBalance();

    constructor(address _usdc) {
        require(_usdc != address(0), "Invalid USDC");
        usdc = IERC20(_usdc);
    }

    /**
     * @notice Deposit USDC into the vault for copy-trading.
     * @param amount Amount in USDC (6 decimals).
     */
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        balanceOf[msg.sender] += amount;
        emit Deposit(msg.sender, amount);
    }

    /**
     * @notice Withdraw USDC from the vault.
     * @param amount Amount to withdraw (6 decimals).
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 userBalance = balanceOf[msg.sender];
        if (amount > userBalance) revert InsufficientBalance();
        balanceOf[msg.sender] = userBalance - amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount);
    }

    /**
     * @notice Returns the total USDC held by the vault.
     */
    function totalSupply() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
