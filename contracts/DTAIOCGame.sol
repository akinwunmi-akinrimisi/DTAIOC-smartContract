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

       struct Game {
           address creator;
           bytes32 basenameNode;
           uint256 stage;
           mapping(address => bool) players;
           uint256 playerCount;
           bool ended;
       }

       mapping(uint256 => Game) public games;

       constructor(
           address _token,
           address _nft,
           address _staking,
           address _basenameResolver
       ) Ownable(msg.sender) {
           require(_token != address(0), "Invalid token address");
           require(_nft != address(0), "Invalid NFT address");
           require(_staking != address(0), "Invalid staking address");
           require(_basenameResolver != address(0), "Invalid resolver address");
           token = DTAIOCToken(_token);
           nft = DTAIOCNFT(_nft);
           staking = DTAIOCStaking(_staking);
           basenameResolver = IBasenameResolver(_basenameResolver);
           gameCounter = 0;
       }

       function createGame(bytes32 basenameNode) public nonReentrant returns (uint256) {
           address creator = basenameResolver.resolve(basenameNode);
           require(creator == msg.sender, "Caller does not own Basename");
           gameCounter++;
           uint256 gameId = gameCounter;

           Game storage game = games[gameId];
           game.creator = creator;
           game.basenameNode = basenameNode;
           game.stage = 1;
           game.playerCount = 0;
           game.ended = false;

           emit GameCreated(gameId, creator, basenameNode);
           return gameId;
       }

       function joinGame(uint256 gameId) public nonReentrant {
           Game storage game = games[gameId];
           require(game.creator != address(0), "Game does not exist");
           require(!game.ended, "Game has ended");
           require(!game.players[msg.sender], "Player already joined");
           require(token.balanceOf(msg.sender) >= STAKE_AMOUNT, "Insufficient balance");
           require(token.allowance(msg.sender, address(staking)) >= STAKE_AMOUNT, "Insufficient allowance");

           game.players[msg.sender] = true;
           game.playerCount++;
           staking.stake(gameId, msg.sender, STAKE_AMOUNT);

           emit PlayerJoined(gameId, msg.sender);
       }

       function advanceStage(uint256 gameId) public onlyOwner {
           Game storage game = games[gameId];
           require(game.creator != address(0), "Game does not exist");
           require(!game.ended, "Game has ended");
           require(game.stage < 4, "Game at final stage");

           game.stage++;
           emit StageAdvanced(gameId, game.stage);
       }

       function refundPlayer(uint256 gameId, address player) public onlyOwner {
           Game storage game = games[gameId];
           require(game.creator != address(0), "Game does not exist");
           require(game.players[player], "Player not in game");

           staking.refund(gameId, player, game.stage);
           game.players[player] = false;
           game.playerCount--;

           emit PlayerRefunded(gameId, player, game.stage);
       }

       function endGame(uint256 gameId, address[] memory winners) public onlyOwner nonReentrant {
           Game storage game = games[gameId];
           require(game.creator != address(0), "Game does not exist");
           require(!game.ended, "Game already ended");
           require(winners.length == 3, "Must provide 3 winners");

           game.ended = true;

           // Mint NFTs for winners
           for (uint256 i = 0; i < winners.length; i++) {
               if (winners[i] != address(0) && game.players[winners[i]]) {
                   uint256 rank = i + 1;
                   nft.mintNFT(winners[i], gameId, rank, NFT_TOKEN_URI);
               }
           }

           // Distribute rewards
           staking.distributeRewards(gameId, game.creator, winners);

           emit GameEnded(gameId, winners);
       }

       event GameCreated(uint256 indexed gameId, address indexed creator, bytes32 basenameNode);
       event PlayerJoined(uint256 indexed gameId, address indexed player);
       event StageAdvanced(uint256 indexed gameId, uint256 stage);
       event PlayerRefunded(uint256 indexed gameId, address indexed player, uint256 stage);
       event GameEnded(uint256 indexed gameId, address[] winners);
   }