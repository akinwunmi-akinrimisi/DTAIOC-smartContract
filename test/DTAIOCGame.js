const { expect } = require("chai");
   const { ethers } = require("hardhat");

   describe("DTAIOCGame", function () {
     let DTAIOCToken, DTAIOCNFT, DTAIOCStaking, DTAIOCGame, token, nft, staking, game, owner, creator, player1, player2, player3, platform;
     let basenameResolver;
     const stakeAmount = ethers.parseEther("10");
     const tokenURI = "ipfs://bafybeigofcndglhgthcq6qrmj3nuc3ahn7diovjxytuifk54t5svhufe4i";
     const basenameNode = ethers.namehash("creator.base.eth");

     beforeEach(async function () {
       [owner, creator, player1, player2, player3, platform] = await ethers.getSigners();

       // Deploy mock BasenameResolver
       const BasenameResolver = await ethers.getContractFactory("MockBasenameResolver");
       basenameResolver = await BasenameResolver.deploy();
       await basenameResolver.setResolvedAddress(basenameNode, creator.address);

       // Deploy DTAIOCToken
       DTAIOCToken = await ethers.getContractFactory("DTAIOCToken");
       token = await DTAIOCToken.deploy();
       await token.waitForDeployment();

       // Deploy DTAIOCNFT
       DTAIOCNFT = await ethers.getContractFactory("DTAIOCNFT");
       nft = await DTAIOCNFT.deploy();
       await nft.waitForDeployment();
       await nft.setGameContract(owner.address); // Temporary for testing

       // Deploy DTAIOCStaking
       DTAIOCStaking = await ethers.getContractFactory("DTAIOCStaking");
       staking = await DTAIOCStaking.deploy(token.target, platform.address);
       await staking.waitForDeployment();
       await staking.setGameContract(owner.address); // Temporary for testing

       // Deploy DTAIOCGame
       DTAIOCGame = await ethers.getContractFactory("DTAIOCGame");
       game = await DTAIOCGame.deploy(token.target, nft.target, staking.target, basenameResolver.target);
       await game.waitForDeployment();

       // Mint tokens and approve staking
       for (const player of [player1, player2, player3]) {
         await token.connect(player).mint(stakeAmount);
         await token.connect(player).approve(staking.target, stakeAmount);
       }
     });

     it("Should have correct initial setup", async function () {
       expect(await game.token()).to.equal(token.target);
       expect(await game.nft()).to.equal(nft.target);
       expect(await game.staking()).to.equal(staking.target);
       expect(await game.basenameResolver()).to.equal(basenameResolver.target);
       expect(await game.gameCounter()).to.equal(0);
       expect(await game.STAKE_AMOUNT()).to.equal(stakeAmount);
       expect(await game.NFT_TOKEN_URI()).to.equal(tokenURI);
       expect(await game.owner()).to.equal(owner.address);
     });

     it("Should allow creator with Basename to create game", async function () {
       const tx = await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await expect(tx).to.emit(game, "GameCreated").withArgs(gameId, creator.address, basenameNode);

       const gameData = await game.games(gameId);
       expect(gameData.creator).to.equal(creator.address);
       expect(gameData.basenameNode).to.equal(basenameNode);
       expect(gameData.stage).to.equal(1);
       expect(gameData.playerCount).to.equal(0);
       expect(gameData.ended).to.equal(false);
     });

     it("Should revert game creation without valid Basename", async function () {
       await expect(
         game.connect(player1).createGame(basenameNode)
       ).to.be.revertedWith("Caller does not own Basename");
     });

     it("Should allow players to join game", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;

       const tx = await game.connect(player1).joinGame(gameId);
       await expect(tx).to.emit(game, "PlayerJoined").withArgs(gameId, player1.address);

       const gameData = await game.games(gameId);
       expect(gameData.playerCount).to.equal(1);
       expect(await staking.playerStakes(gameId, player1.address)).to.equal(stakeAmount);
       expect(await token.balanceOf(player1.address)).to.equal(0);
     });

     it("Should revert joining non-existent game", async function () {
       await expect(
         game.connect(player1).joinGame(1)
       ).to.be.revertedWith("Game does not exist");
     });

     it("Should revert joining ended game", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await game.connect(player1).joinGame(gameId);
       await game.endGame(gameId, [player1.address, player1.address, player1.address]);

       await expect(
         game.connect(player2).joinGame(gameId)
       ).to.be.revertedWith("Game has ended");
     });

     it("Should revert joining with insufficient balance", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await token.connect(player1).transfer(player2.address, stakeAmount); // Clear player1 balance

       await expect(
         game.connect(player1).joinGame(gameId)
       ).to.be.revertedWith("Insufficient balance");
     });

     it("Should revert joining with insufficient allowance", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await token.connect(player1).approve(staking.target, 0); // Revoke allowance

       await expect(
         game.connect(player1).joinGame(gameId)
       ).to.be.revertedWith("Insufficient allowance");
     });

     it("Should revert joining twice", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await game.connect(player1).joinGame(gameId);

       await expect(
         game.connect(player1).joinGame(gameId)
       ).to.be.revertedWith("Player already joined");
     });

     it("Should allow owner to advance stage", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       const tx = await game.advanceStage(gameId);
       await expect(tx).to.emit(game, "StageAdvanced").withArgs(gameId, 2);

       const gameData = await game.games(gameId);
       expect(gameData.stage).to.equal(2);
     });

     it("Should revert advanceStage by non-owner", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await expect(
         game.connect(player1).advanceStage(gameId)
       ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount").withArgs(player1.address);
     });

     it("Should revert advanceStage for non-existent game", async function () {
       await expect(
         game.advanceStage(1)
       ).to.be.revertedWith("Game does not exist");
     });

     it("Should revert advanceStage for ended game", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await game.connect(player1).joinGame(gameId);
       await game.endGame(gameId, [player1.address, player1.address, player1.address]);

       await expect(
         game.advanceStage(gameId)
       ).to.be.revertedWith("Game has ended");
     });

     it("Should revert advanceStage at final stage", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await game.advanceStage(gameId); // Stage 2
       await game.advanceStage(gameId); // Stage 3
       await game.advanceStage(gameId); // Stage 4

       await expect(
         game.advanceStage(gameId)
       ).to.be.revertedWith("Game at final stage");
     });

     it("Should allow owner to refund player", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await game.connect(player1).joinGame(gameId);
       await game.advanceStage(gameId); // Stage 2: 30% refund

       const tx = await game.refundPlayer(gameId, player1.address);
       await expect(tx).to.emit(game, "PlayerRefunded").withArgs(gameId, player1.address, 2);

       const gameData = await game.games(gameId);
       expect(gameData.playerCount).to.equal(0);
       expect(await token.balanceOf(player1.address)).to.equal(ethers.parseEther("3"));
     });

     it("Should revert refund for non-existent game", async function () {
       await expect(
         game.refundPlayer(1, player1.address)
       ).to.be.revertedWith("Game does not exist");
     });

     it("Should revert refund for non-player", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await expect(
         game.refundPlayer(gameId, player1.address)
       ).to.be.revertedWith("Player not in game");
     });

     it("Should allow owner to end game and distribute rewards/NFTs", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await game.connect(player1).joinGame(gameId);
       await game.connect(player2).joinGame(gameId);
       await game.connect(player3).joinGame(gameId);
       await game.advanceStage(gameId); // Stage 2
       await game.refundPlayer(gameId, player3.address); // Forfeits 7 tokens

       const winners = [player1.address, player2.address, player1.address];
       const tx = await game.endGame(gameId, winners);
       await expect(tx).to.emit(game, "GameEnded").withArgs(gameId, winners);

       // Check NFTs
       expect(await nft.ownerOf(1)).to.equal(player1.address);
       expect(await nft.ownerOf(2)).to.equal(player2.address);
       expect(await nft.ownerOf(3)).to.equal(player1.address);
       expect(await nft.tokenURI(1)).to.equal(tokenURI);

       // Check rewards: 7 forfeited tokens
       // Creator: 20% = 1.4 tokens
       // Platform: 20% = 1.4 tokens
       // Winners: 60% = 4.2 tokens (1.4 per winner)
       expect(await token.balanceOf(creator.address)).to.equal(ethers.parseEther("1.4"));
       expect(await token.balanceOf(platform.address)).to.equal(ethers.parseEther("1.4"));
       expect(await token.balanceOf(player1.address)).to.equal(ethers.parseEther("2.8")); // 1.4 + 1.4
       expect(await token.balanceOf(player2.address)).to.equal(ethers.parseEther("1.4"));
     });

     it("Should revert endGame by non-owner", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await expect(
         game.connect(player1).endGame(gameId, [player1.address, player1.address, player1.address])
       ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount").withArgs(player1.address);
     });

     it("Should revert endGame for non-existent game", async function () {
       await expect(
         game.endGame(1, [player1.address, player1.address, player1.address])
       ).to.be.revertedWith("Game does not exist");
     });

     it("Should revert endGame for already ended game", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await game.connect(player1).joinGame(gameId);
       await game.endGame(gameId, [player1.address, player1.address, player1.address]);

       await expect(
         game.endGame(gameId, [player1.address, player1.address, player1.address])
       ).to.be.revertedWith("Game already ended");
     });

     it("Should revert endGame with invalid winners length", async function () {
       await game.connect(creator).createGame(basenameNode);
       const gameId = 1;
       await expect(
         game.endGame(gameId, [player1.address])
       ).to.be.revertedWith("Must provide 3 winners");
     });
   });

   // Mock BasenameResolver for testing
   const { ethers } = require("hardhat");

   contract("MockBasenameResolver", function () {
     let resolver, owner;

     beforeEach(async function () {
       [owner] = await ethers.getSigners();
       const BasenameResolver = await ethers.getContractFactory("MockBasenameResolver");
       resolver = await BasenameResolver.deploy();
       await resolver.waitForDeployment();
     });

     it("Should resolve Basename correctly", async function () {
       const node = ethers.namehash("test.base.eth");
       await resolver.setResolvedAddress(node, owner.address);
       expect(await resolver.resolve(node)).to.equal(owner.address);
     });
   });