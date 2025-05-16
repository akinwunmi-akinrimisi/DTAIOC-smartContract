// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./DTAIOCToken.sol";
import "./DTAIOCNFT.sol";
import "./DTAIOCStaking.sol";

interface IBasenameResolver {
    function namehash(bytes32 node) external pure returns (bytes32);
    function resolve(bytes32 node) external view returns (address);
    function resolveTwitter(string calldata twitterUsername) external view returns (address);
}

contract DTAIOCGame is Ownable, ReentrancyGuard {
    // Custom errors for gas efficiency
    error InvalidAddress();
    error InvalidIdentifier();
    error UnauthorizedCaller();
    error InvalidGameDuration();
    error InvalidQuestionHash();
    error DuplicateQuestionHash();
    error GameDoesNotExist();
    error GameAlreadyEnded(); // Renamed from GameEnded to avoid conflict
    error GameDurationExceeded();
    error PlayerLimitReached();
    error AlreadyParticipated();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidStage();
    error NotInGame();
    error StageMismatch();
    error InvalidAnswerCount();
    error InvalidScore();
    error InvalidStringLength();
    error InvalidSignature();

    // Events
    event GameCreated(uint256 indexed gameId, address indexed creator, bytes32 basenameNode, string twitterUsername);
    event PlayerJoined(uint256 indexed gameId, address indexed player, string basename, string twitterUsername);
    event StageAdvanced(uint256 indexed gameId, uint256 stage);
    event StageCompleted(
        uint256 indexed gameId,
        address indexed player,
        uint256 stage,
        uint256 score,
        string basename,
        string twitterUsername,
        uint256 completionTime
    );
    event PlayerEliminated(
        uint256 indexed gameId,
        address indexed player,
        uint256 stage,
        uint256 score,
        string basename,
        string twitterUsername
    );
    event GameEnded(uint256 indexed gameId, address[] winners);
    event BackendSignerUpdated(address indexed newSigner);

    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public submitted;
    DTAIOCToken public immutable token;
    DTAIOCNFT public immutable nft;
    DTAIOCStaking public immutable staking;
    IBasenameResolver public immutable basenameResolver;
    address public backendSigner;
    address public immutable platformAddress;
    uint256 public gameCounter;
    uint256 public constant STAKE_AMOUNT = 10 * 10**18;
    uint256 public constant PLAYER_LIMIT = 100;
    uint256 public constant DEFAULT_GAME_DURATION = 1 hours;
    uint256 public constant MAX_STRING_LENGTH = 64;
    string public constant NFT_TOKEN_URI = "ipfs://bafybeigofcndglhgthcq6qrmj3nuc3ahn7diovjxytuifk54t5svhufe4i";

    struct Player {
        string basename;
        string twitterUsername;
        uint256 currentStage;
        uint256 score;
        uint256 completionTime;
    }

    struct Game {
        address creator;
        bytes32 basenameNode;
        string twitterUsername;
        uint256 stage;
        uint256 startTime;
        uint256 gameDuration;
        mapping(address => Player) players;
        mapping(address => bool) participated;
        uint256 playerCount;
        bool ended;
        bytes32[3] questionRootHashes;
        address[] perfectScorers;
        address[] activePlayers;
    }

    mapping(uint256 => Game) internal gamesData;
    mapping(uint256 => mapping(bytes32 => bool)) public questionHashUnique;

    enum GameStatus { Inactive, Active, Distributing }
    mapping(uint256 => GameStatus) private gameStatus;

    constructor(
        address _token,
        address _nft,
        address _staking,
        address _basenameResolver,
        address _backendSigner,
        address _platformAddress
    ) Ownable(msg.sender) {
        if (_token == address(0)) revert InvalidAddress();
        if (_nft == address(0)) revert InvalidAddress();
        if (_staking == address(0)) revert InvalidAddress();
        if (_basenameResolver == address(0)) revert InvalidAddress();
        if (_backendSigner == address(0)) revert InvalidAddress();
        if (_platformAddress == address(0)) revert InvalidAddress();
        token = DTAIOCToken(_token);
        nft = DTAIOCNFT(_nft);
        staking = DTAIOCStaking(_staking);
        basenameResolver = IBasenameResolver(_basenameResolver);
        backendSigner = _backendSigner;
        platformAddress = _platformAddress;
    }

    function games(uint256 gameId) external view returns (
        address creator,
        bytes32 basenameNode,
        string memory twitterUsername,
        uint256 stage,
        uint256 startTime,
        uint256 gameDuration,
        uint256 playerCount,
        bool ended,
        bytes32[3] memory questionRootHashes,
        address[] memory perfectScorers
    ) {
        Game storage game = gamesData[gameId];
        return (
            game.creator,
            game.basenameNode,
            game.twitterUsername,
            game.stage,
            game.startTime,
            game.gameDuration,
            game.playerCount,
            game.ended,
            game.questionRootHashes,
            game.perfectScorers
        );
    }

    function createGame(
        string memory basename,
        string memory twitterUsername,
        bytes32[3] memory questionRootHashes,
        uint256 _gameDuration,
        bytes memory signature
    ) public nonReentrant returns (uint256) {
        bool hasBasename = bytes(basename).length > 0;
        bool hasTwitter = bytes(twitterUsername).length > 0;
        if (hasBasename == hasTwitter) revert InvalidIdentifier();
        if (hasBasename && bytes(basename).length > MAX_STRING_LENGTH) revert InvalidStringLength();
        if (hasTwitter && bytes(twitterUsername).length > MAX_STRING_LENGTH) revert InvalidStringLength();

        address creator;
        bytes32 basenameNode;
        if (hasBasename) {
            basenameNode = basenameResolver.namehash(keccak256(abi.encodePacked(basename)));
            creator = basenameResolver.resolve(basenameNode);
            if (creator != msg.sender) revert UnauthorizedCaller();
        } else {
            creator = basenameResolver.resolveTwitter(twitterUsername);
            if (creator != msg.sender) revert UnauthorizedCaller();
            bytes32 messageHash = keccak256(abi.encode(msg.sender, twitterUsername, gameCounter + 1));
            if (!verify(backendSigner, messageHash, signature)) revert InvalidSignature();
        }

        if (_gameDuration < 1 hours || _gameDuration > 24 hours) revert InvalidGameDuration();
        for (uint256 i = 0; i < 3; ++i) {
            if (questionRootHashes[i] == bytes32(0)) revert InvalidQuestionHash();
            if (questionHashUnique[gameCounter + 1][questionRootHashes[i]]) revert DuplicateQuestionHash();
            questionHashUnique[gameCounter + 1][questionRootHashes[i]] = true;
        }

        gameCounter++;
        uint256 gameId = gameCounter;

        Game storage game = gamesData[gameId];
        game.creator = creator;
        game.basenameNode = hasBasename ? basenameNode : bytes32(0);
        game.twitterUsername = hasTwitter ? twitterUsername : "";
        game.stage = 1;
        game.startTime = block.timestamp;
        game.gameDuration = _gameDuration;
        game.playerCount = 0;
        game.ended = false;
        for (uint256 i = 0; i < 3; ++i) {
            game.questionRootHashes[i] = questionRootHashes[i];
        }

        gameStatus[gameId] = GameStatus.Active;
        emit GameCreated(gameId, creator, basenameNode, twitterUsername);
        return gameId;
    }

    function joinGame(
        uint256 gameId,
        string memory basename,
        string memory twitterUsername,
        bytes memory signature
    ) public nonReentrant {
        Game storage game = gamesData[gameId];
        if (game.creator == address(0)) revert GameDoesNotExist();
        if (game.ended) revert GameAlreadyEnded();
        if (block.timestamp > game.startTime + game.gameDuration) revert GameDurationExceeded();
        if (game.playerCount >= PLAYER_LIMIT) revert PlayerLimitReached();
        if (game.participated[msg.sender]) revert AlreadyParticipated();
        if (token.balanceOf(msg.sender) < STAKE_AMOUNT) revert InsufficientBalance();
        if (token.allowance(msg.sender, address(staking)) < STAKE_AMOUNT) revert InsufficientAllowance();

        bool hasBasename = bytes(basename).length > 0;
        bool hasTwitter = bytes(twitterUsername).length > 0;
        if (hasBasename == hasTwitter) revert InvalidIdentifier();
        if (hasBasename && bytes(basename).length > MAX_STRING_LENGTH) revert InvalidStringLength();
        if (hasTwitter && bytes(twitterUsername).length > MAX_STRING_LENGTH) revert InvalidStringLength();

        if (hasBasename) {
            bytes32 basenameNode = basenameResolver.namehash(keccak256(abi.encodePacked(basename)));
            if (basenameResolver.resolve(basenameNode) != msg.sender) revert UnauthorizedCaller();
            bytes32 messageHash = keccak256(abi.encode(msg.sender, basename, gameId));
            if (!verify(backendSigner, messageHash, signature)) revert InvalidSignature();
            game.players[msg.sender] = Player(basename, "", 1, 0, 0);
        } else {
            if (basenameResolver.resolveTwitter(twitterUsername) != msg.sender) revert UnauthorizedCaller();
            bytes32 messageHash = keccak256(abi.encode(msg.sender, twitterUsername, gameId));
            if (!verify(backendSigner, messageHash, signature)) revert InvalidSignature();
            game.players[msg.sender] = Player("", twitterUsername, 1, 0, 0);
        }

        game.participated[msg.sender] = true;
        game.playerCount++;
        game.activePlayers.push(msg.sender);
        staking.stake(gameId, msg.sender, STAKE_AMOUNT);

        emit PlayerJoined(gameId, msg.sender, basename, twitterUsername);
    }

    function submitAnswers(
        uint256 gameId,
        uint256 stage,
        bytes32[] memory answerHashes,
        uint256 score,
        bytes memory signature
    ) public nonReentrant {
        Game storage game = gamesData[gameId];
        if (game.stage != stage) revert InvalidStage();
        if (stage < 1 || stage > 3) revert InvalidStage();
        if (game.ended) revert GameAlreadyEnded();
        if (answerHashes.length != 5) revert InvalidAnswerCount();
        if (score > 5) revert InvalidScore();
        if (!game.participated[msg.sender]) revert NotInGame();
        Player storage player = game.players[msg.sender];
        if (player.currentStage != stage) revert StageMismatch();

        bytes32 messageHash = keccak256(
            abi.encode(gameId, msg.sender, stage, score, answerHashes)
        );
        if (!verify(backendSigner, messageHash, signature)) revert InvalidSignature();

        player.score += score;
        player.completionTime = block.timestamp;

        if (score == 5 && stage == 3) {
            game.perfectScorers.push(msg.sender);
        }

        if (score < 5 || stage == 3) {
            staking.refund(gameId, msg.sender, stage);
            player.currentStage = 0;
            game.playerCount--;
            emit PlayerEliminated(gameId, msg.sender, stage, score, player.basename, player.twitterUsername);
        } else {
            player.currentStage = stage + 1;
            emit StageCompleted(gameId, msg.sender, stage, score, player.basename, player.twitterUsername, block.timestamp);
        }
    }

    function advanceStage(uint256 gameId) public onlyOwner {
        Game storage game = gamesData[gameId];
        if (game.creator == address(0)) revert GameDoesNotExist();
        if (game.ended) revert GameAlreadyEnded();
        if (game.stage >= 4) revert InvalidStage();
        game.stage++;
        emit StageAdvanced(gameId, game.stage);
    }

    function refundPlayer(uint256 gameId, address player) public onlyOwner {
        Game storage game = gamesData[gameId];
        if (game.creator == address(0)) revert GameDoesNotExist();
        if (!game.participated[player]) revert NotInGame();

        Player storage p = game.players[player];
        staking.refund(gameId, player, game.stage);
        emit PlayerEliminated(gameId, player, game.stage, 0, p.basename, p.twitterUsername);
        delete game.players[player];
        game.participated[player] = false;
        game.playerCount--;
        for (uint256 i = 0; i < game.activePlayers.length; ++i) {
            if (game.activePlayers[i] == player) {
                game.activePlayers[i] = game.activePlayers[game.activePlayers.length - 1];
                game.activePlayers.pop();
                break;
            }
        }
    }

    function endGame(uint256 gameId) public onlyOwner nonReentrant {
        Game storage game = gamesData[gameId];
        if (game.creator == address(0)) revert GameDoesNotExist();
        if (game.ended) revert GameAlreadyEnded();
        if (block.timestamp <= game.startTime + game.gameDuration) revert GameDurationExceeded();
        if (gameStatus[gameId] != GameStatus.Active) revert InvalidStage();

        gameStatus[gameId] = GameStatus.Distributing;
        game.ended = true;

        address[] memory winnersArray = new address[](3);
        if (game.perfectScorers.length > 0) {
            address[] memory sortedScorers = new address[](game.perfectScorers.length);
            for (uint256 i = 0; i < game.perfectScorers.length; ++i) {
                sortedScorers[i] = game.perfectScorers[i];
            }
            uint256 maxScorers = game.perfectScorers.length > 10 ? 10 : game.perfectScorers.length;
            for (uint256 i = 0; i < maxScorers; ++i) {
                for (uint256 j = i + 1; j < maxScorers; ++j) {
                    if (
                        game.players[sortedScorers[j]].completionTime <
                        game.players[sortedScorers[i]].completionTime
                    ) {
                        address temp = sortedScorers[i];
                        sortedScorers[i] = sortedScorers[j];
                        sortedScorers[j] = temp;
                    }
                }
            }
            for (uint256 i = 0; i < 3 && i < maxScorers; ++i) {
                winnersArray[i] = sortedScorers[i];
            }
        }

        for (uint256 i = 0; i < 3; ++i) {
            if (winnersArray[i] != address(0) && game.participated[winnersArray[i]]) {
                uint256 rank = i + 1;
                nft.mintNFT(winnersArray[i], gameId, rank, NFT_TOKEN_URI);
            }
        }

        if (staking.forfeitedStakes(gameId) > 0) {
            staking.distributeRewards(gameId, game.creator, platformAddress, winnersArray);
        }

        gameStatus[gameId] = GameStatus.Inactive;
        emit GameEnded(gameId, winnersArray);
    }

    function autoEndGame(uint256 gameId) external {
        Game storage game = gamesData[gameId];
        if (game.creator == address(0)) revert GameDoesNotExist();
        if (game.ended) revert GameAlreadyEnded();
        if (block.timestamp <= game.startTime + game.gameDuration) revert GameDurationExceeded();
        endGame(gameId);
    }

    function getLeaderboardData(uint256 gameId)
        public
        view
        returns (
            address[] memory playerAddresses,
            string[] memory basenames,
            string[] memory twitterUsernames,
            uint256[] memory currentStages,
            uint256[] memory scores,
            uint256[] memory completionTimes
        )
    {
        Game storage game = gamesData[gameId];
        if (game.creator == address(0)) revert GameDoesNotExist();

        uint256 activeCount = game.playerCount;
        playerAddresses = new address[](activeCount);
        basenames = new string[](activeCount);
        twitterUsernames = new string[](activeCount);
        currentStages = new uint256[](activeCount);
        scores = new uint256[](activeCount);
        completionTimes = new uint256[](activeCount);

        for (uint256 i = 0; i < activeCount; ++i) {
            address playerAddr = game.activePlayers[i];
            Player storage player = game.players[playerAddr];
            playerAddresses[i] = playerAddr;
            basenames[i] = player.basename;
            twitterUsernames[i] = player.twitterUsername;
            currentStages[i] = player.currentStage;
            scores[i] = player.score;
            completionTimes[i] = player.completionTime;
        }
        return (playerAddresses, basenames, twitterUsernames, currentStages, scores, completionTimes);
    }

    function isPlayerInGame(uint256 gameId, address player) public view returns (bool) {
        return gamesData[gameId].participated[player];
    }

    function getPlayer(uint256 gameId, address playerAddress) public view returns (
        string memory basename,
        string memory twitterUsername,
        uint256 currentStage,
        uint256 score,
        uint256 completionTime
    ) {
        Player storage player = gamesData[gameId].players[playerAddress];
        return (
            player.basename,
            player.twitterUsername,
            player.currentStage,
            player.score,
            player.completionTime
        );
    }

    function setBackendSigner(address _backendSigner) public onlyOwner {
        if (_backendSigner == address(0)) revert InvalidAddress();
        backendSigner = _backendSigner;
        emit BackendSignerUpdated(_backendSigner);
    }

    function verify(address signer, bytes32 hash, bytes memory signature) public pure returns (bool) {
        // Manual implementation to avoid ECDSA.toEthSignedMessageHash issue
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
        );
        return ECDSA.recover(ethSignedMessageHash, signature) == signer;
    }
}