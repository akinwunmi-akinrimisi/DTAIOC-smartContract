// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./DTAIOCToken.sol";
import "./DTAIOCNFT.sol";
import "./DTAIOCStaking.sol";

interface IBasenameResolver {
    function namehash(bytes32 node) external pure returns (bytes32);
    function resolve(bytes32 node) external view returns (address);
}

contract DTAIOCGame is Ownable, ReentrancyGuard {
    DTAIOCToken public token;
    DTAIOCNFT public nft;
    DTAIOCStaking public staking;
    IBasenameResolver public basenameResolver;
    uint256 public gameCounter;
    uint256 public constant STAKE_AMOUNT = 10 * 10**18;
    string public constant NFT_TOKEN_URI = "ipfs://bafybeigofcndglhgthcq6qrmj3nuc3ahn7diovjxytuifk54t5svhufe4i";

    struct Player {
        string basename;
        uint256 currentStage;
        uint256 score;
        uint256 completionTime;
    }

    struct Game {
        address creator;
        bytes32 basenameNode;
        uint256 stage;
        mapping(address => Player) players;
        mapping(address => bool) participated;
        uint256 playerCount;
        bool ended;
    }

    // This is the internal mapping of games
    mapping(uint256 => Game) internal gamesData;

    // Public getter function for Game struct properties
    function games(uint256 gameId) external view returns (
        address creator, 
        bytes32 basenameNode, 
        uint256 stage, 
        uint256 playerCount, 
        bool ended
    ) {
        Game storage game = gamesData[gameId];
        return (
            game.creator, 
            game.basenameNode, 
            game.stage, 
            game.playerCount, 
            game.ended
        );
    }

    constructor(
        address _token,
        address _nft,
        address _staking,
        address _basenameResolver,
        address _backendSigner
    ) Ownable(msg.sender) {
        require(_token != address(0), "Invalid token address");
        require(_nft != address(0), "Invalid NFT address");
        require(_staking != address(0), "Invalid staking address");
        require(_basenameResolver != address(0), "Invalid resolver address");
        require(_backendSigner != address(0), "Invalid backend signer address");
        token = DTAIOCToken(_token);
        nft = DTAIOCNFT(_nft);
        staking = DTAIOCStaking(_staking);
        basenameResolver = IBasenameResolver(_basenameResolver);
        backendSigner = _backendSigner;
        gameCounter = 0;
    }

    function createGame(bytes32 basenameNode) public nonReentrant returns (uint256) {
        address creator = basenameResolver.resolve(basenameNode);
        require(creator == msg.sender, "Caller does not own Basename");
        gameCounter++;
        uint256 gameId = gameCounter;

        Game storage game = gamesData[gameId];
        game.creator = creator;
        game.basenameNode = basenameNode;
        game.stage = 1;
        game.playerCount = 0;
        game.ended = false;

        emit GameCreated(gameId, creator, basenameNode);
        return gameId;
    }

    function joinGame(uint256 gameId, string memory basename, bytes memory signature) 
        public 
        nonReentrant 
    {
        Game storage game = gamesData[gameId];
        require(game.creator != address(0), "Game does not exist");
        require(!game.ended, "Game has ended");
        require(!game.participated[msg.sender], "Player already joined");
        require(token.balanceOf(msg.sender) >= STAKE_AMOUNT, "Insufficient balance");
        require(token.allowance(msg.sender, address(staking)) >= STAKE_AMOUNT, "Insufficient allowance");

        // Verify Basename resolves to msg.sender
        bytes32 basenameNode = basenameResolver.namehash(keccak256(abi.encodePacked(basename)));
        require(basenameResolver.resolve(basenameNode) == msg.sender, "Basename does not resolve to caller");

        // Verify backend signature for wallet, basename, gameId
        bytes32 messageHash = keccak256(
            abi.encode(
                msg.sender, 
                basename, 
                gameId
            )
        );
        
        require(verify(backendSigner, messageHash, signature), "Invalid signature");

        // Mark player as participated and store Basename
        game.participated[msg.sender] = true;
        game.players[msg.sender] = Player(basename, 1, 0, 0);
        game.playerCount++;

        // Stake tokens
        staking.stake(gameId, msg.sender, STAKE_AMOUNT);

        emit PlayerJoined(gameId, msg.sender, basename);
    }

    function advanceStage(uint256 gameId) public onlyOwner {
        Game storage game = gamesData[gameId];
        require(game.creator != address(0), "Game does not exist");
        require(!game.ended, "Game has ended");
        require(game.stage < 4, "Game at final stage");

        game.stage++;
        emit StageAdvanced(gameId, game.stage);
    }

    function refundPlayer(uint256 gameId, address player) public onlyOwner {
        Game storage game = gamesData[gameId];
        require(game.creator != address(0), "Game does not exist");
        require(game.participated[player], "Player not in game");

        staking.refund(gameId, player, game.stage);
        delete game.players[player];
        game.participated[player] = false;
        game.playerCount--;

        emit PlayerRefunded(gameId, player, game.stage);
    }

    function endGame(uint256 gameId, address[] memory winners) public onlyOwner nonReentrant {
        Game storage game = gamesData[gameId];
        require(game.creator != address(0), "Game does not exist");
        require(!game.ended, "Game already ended");
        require(winners.length == 3, "Must provide 3 winners");

        game.ended = true;

        // Mint NFTs for winners
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] != address(0) && game.participated[winners[i]]) {
                uint256 rank = i + 1;
                nft.mintNFT(winners[i], gameId, rank, NFT_TOKEN_URI);
            }
        }

        // Distribute rewards only if there are forfeited stakes
        if (staking.forfeitedStakes(gameId) > 0) {
            staking.distributeRewards(gameId, game.creator, winners);
        }

        emit GameEnded(gameId, winners);
    }

    // Check if a player is participating in a game
    function isPlayerInGame(uint256 gameId, address player) public view returns (bool) {
        return gamesData[gameId].participated[player];
    }

    // Get player information
    function getPlayer(uint256 gameId, address playerAddress) public view returns (
        string memory basename,
        uint256 currentStage,
        uint256 score,
        uint256 completionTime
    ) {
        Player storage player = gamesData[gameId].players[playerAddress];
        return (
            player.basename,
            player.currentStage,
            player.score,
            player.completionTime
        );
    }

    event GameCreated(uint256 indexed gameId, address indexed creator, bytes32 basenameNode);
    event PlayerJoined(uint256 indexed gameId, address indexed player, string basename);
    event StageAdvanced(uint256 indexed gameId, uint256 stage);
    event PlayerRefunded(uint256 indexed gameId, address indexed player, uint256 stage);
    event GameEnded(uint256 indexed gameId, address[] winners);

    address public backendSigner;

    function setBackendSigner(address _backendSigner) public onlyOwner {
        require(_backendSigner != address(0), "Invalid backend signer address");
        backendSigner = _backendSigner;
    }

    // Fixed signature verification to work with ethers.js signMessage
    function verify(address signer, bytes32 hash, bytes memory signature) public pure returns (bool) {
        // Create Ethereum signed message hash
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
        );
        
        // Split signature
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(signature);
        
        // Recover signer
        address recovered = ecrecover(ethSignedMessageHash, v, r, s);
        
        return recovered == signer;
    }

    function splitSignature(bytes memory sig) private pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "Invalid signature length");
        
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        
        return (r, s, v);
    }
}