// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DTAIOCNFT is ERC721URIStorage, Ownable {
    // Custom errors for gas efficiency
    error InvalidAddress();
    error InvalidRank();
    error InvalidTokenURI();
    error UnauthorizedCaller();

    // Immutable state variables
    address public gameContract; // Changed to mutable for setGameContract
    uint256 private _tokenIdCounter;

    // Events
    event NFTMinted(uint256 indexed tokenId, address indexed recipient, uint256 gameId, uint256 rank, string tokenURI);
    event GameContractUpdated(address indexed newGameContract);

    constructor(address _gameContract) ERC721("DTriviaAIOnChain NFT", "DTAIOCNFT") Ownable(msg.sender) {
        if (_gameContract == address(0)) revert InvalidAddress();
        gameContract = _gameContract;
        _tokenIdCounter = 0;
    }

    modifier onlyGameContract() {
        if (msg.sender != gameContract) revert UnauthorizedCaller();
        _;
    }

    function setGameContract(address _gameContract) external onlyOwner {
        if (_gameContract == address(0)) revert InvalidAddress();
        gameContract = _gameContract;
        emit GameContractUpdated(_gameContract);
    }

    function mintNFT(address recipient, uint256 gameId, uint256 rank, string memory tokenURI)
        public
        onlyGameContract
        returns (uint256)
    {
        if (recipient == address(0)) revert InvalidAddress();
        if (rank < 1 || rank > 3) revert InvalidRank();
        if (!_isValidTokenURI(tokenURI)) revert InvalidTokenURI();

        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;
        _mint(recipient, newTokenId);
        _setTokenURI(newTokenId, tokenURI);

        emit NFTMinted(newTokenId, recipient, gameId, rank, tokenURI);
        return newTokenId;
    }

    // Internal function to validate IPFS token URI
    function _isValidTokenURI(string memory tokenURI) internal pure returns (bool) {
        bytes memory uriBytes = bytes(tokenURI);
        if (uriBytes.length < 7) return false; // Minimum length for "ipfs://"

        // Check prefix "ipfs://"
        bytes memory prefix = bytes("ipfs://");
        for (uint256 i = 0; i < 7; i++) {
            if (uriBytes[i] != prefix[i]) return false;
        }

        // Check CID length (46 for CIDv0, e.g., "bafybeigofcndglhgthcq6qrmj3nuc3ahn7diovjxytuifk54t5svhufe4i")
        if (uriBytes.length != 53) return false; // 7 (prefix) + 46 (CID)

        // Basic CID format check (alphanumeric base32)
        for (uint256 i = 7; i < uriBytes.length; i++) {
            bytes1 b = uriBytes[i];
            if (
                !(b >= 0x30 && b <= 0x39) && // 0-9
                !(b >= 0x61 && b <= 0x7A) && // a-z
                !(b >= 0x41 && b <= 0x5A)    // A-Z
            ) return false;
        }

        return true;
    }
}