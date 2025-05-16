// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockBasenameResolver is Ownable {
    // Mappings for basename and Twitter resolution
    mapping(bytes32 => address) private resolvedAddresses;
    mapping(address => string) public basenames;
    mapping(string => address) private twitterToAddress;
    mapping(address => string) public twitterUsernames;

    // Events for transparency
    event ResolvedAddressSet(bytes32 indexed node, address addr);
    event BasenameSet(address indexed wallet, string basename);
    event TwitterUsernameSet(address indexed wallet, string twitterUsername);

    constructor() Ownable(msg.sender) {}

    function namehash(bytes32 node) external pure returns (bytes32) {
        // Simplified ENS namehash: keccak256(node) for mock purposes
        // In production, implement full ENS namehash (see @ensdomains/ens-contracts)
        return keccak256(abi.encodePacked(node));
    }

    function resolve(bytes32 node) external view returns (address) {
        return resolvedAddresses[node];
    }

    function getBasename(address wallet) external view returns (string memory) {
        return basenames[wallet];
    }

    function resolveTwitter(string calldata twitterUsername) external view returns (address) {
        return twitterToAddress[twitterUsername];
    }

    function getTwitterUsername(address wallet) external view returns (string memory) {
        return twitterUsernames[wallet];
    }

    function setResolvedAddress(bytes32 node, address addr) external onlyOwner {
        resolvedAddresses[node] = addr;
        emit ResolvedAddressSet(node, addr);
    }

    function setBasename(address wallet, string memory basename) external onlyOwner {
        basenames[wallet] = basename;
        resolvedAddresses[keccak256(abi.encodePacked(basename))] = wallet;
        emit BasenameSet(wallet, basename);
    }

    function setTwitterUsername(address wallet, string memory twitterUsername) external onlyOwner {
        twitterUsernames[wallet] = twitterUsername;
        twitterToAddress[twitterUsername] = wallet;
        emit TwitterUsernameSet(wallet, twitterUsername);
    }
}