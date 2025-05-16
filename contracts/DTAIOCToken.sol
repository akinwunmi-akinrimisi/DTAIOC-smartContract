// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DTAIOCToken is ERC20, Ownable {
    // Custom errors for gas efficiency
    error InvalidAmount();
    error ExceedsMaxSupply();
    error ExceedsMaxMintPerWallet();
    error MintingPaused();
    error InvalidAddress();

    // Constants
    uint256 public constant MAX_SUPPLY = 5_000_000 * 10**18;
    uint256 public constant MAX_MINT_PER_WALLET = 30 * 10**18;

    // State variables
    bool public mintingPaused;

    // Events
    event MintingPausedEvent();
    event MintingUnpausedEvent();
    event TokensMinted(address indexed recipient, uint256 amount);
    event BatchMinted(address[] recipients, uint256[] amounts);

    constructor() ERC20("DTriviaAIOnChain Token", "DTAIOC") Ownable(msg.sender) {
        mintingPaused = false;
    }

    modifier whenMintingNotPaused() {
        if (mintingPaused) revert MintingPaused();
        _;
    }

    function mint(uint256 amount) public whenMintingNotPaused {
        if (amount == 0) revert InvalidAmount();
        if (totalSupply() + amount > MAX_SUPPLY) revert ExceedsMaxSupply();
        if (balanceOf(msg.sender) + amount > MAX_MINT_PER_WALLET) revert ExceedsMaxMintPerWallet();

        _mint(msg.sender, amount);
        emit TokensMinted(msg.sender, amount);
    }

    function batchMint(address[] memory recipients, uint256[] memory amounts) public onlyOwner whenMintingNotPaused {
        if (recipients.length == 0 || recipients.length != amounts.length) revert InvalidAmount();
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            if (recipients[i] == address(0)) revert InvalidAddress();
            if (amounts[i] == 0) revert InvalidAmount();
            if (balanceOf(recipients[i]) + amounts[i] > MAX_MINT_PER_WALLET) revert ExceedsMaxMintPerWallet();
            totalAmount += amounts[i];
        }

        if (totalSupply() + totalAmount > MAX_SUPPLY) revert ExceedsMaxSupply();

        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
            emit TokensMinted(recipients[i], amounts[i]);
        }
        emit BatchMinted(recipients, amounts);
    }

    function pauseMinting() public onlyOwner {
        mintingPaused = true;
        emit MintingPausedEvent();
    }

    function unpauseMinting() public onlyOwner {
        mintingPaused = false;
        emit MintingUnpausedEvent();
    }
}