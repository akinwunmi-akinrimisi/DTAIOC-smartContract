const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DTAIOCGame", function () {
  let DTAIOCToken, DTAIOCNFT, DTAIOCStaking, DTAIOCGame, token, nft, staking, game, owner, creator, player1, player2, player3, player4, platform, backendSigner;
  let basenameResolver;
  const stakeAmount = ethers.parseEther("10");
  const tokenURI = "ipfs://bafybeigofcndglhgthcq6qrmj3nuc3ahn7diovjxytuifk54t5svhufe4i";
  const gameDuration = 3600; // 1 hour

  // Global counter for unique question hashes
  let hashCounter = 0;

  // Basename nodes and strings
  const creatorBasenameNode = ethers.keccak256(ethers.toUtf8Bytes("creator.base.eth"));
  const player1Basename = "player1.base.eth";
  const player2Basename = "player2.base.eth";
  const player3Basename = "player3.base.eth";
  const player4Basename = "player4.base.eth";

  // Generate mock answer hashes
  async function generateAnswerHashes(score, stage) {
    const answerHashes = [];
    const uniqueId = hashCounter++;
    for (let i = 0; i < 5; i++) {
      answerHashes.push(
        ethers.keccak256(ethers.toUtf8Bytes(`answer_${stage}_${i}_${score >= i + 1 ? "correct" : "incorrect"}_${uniqueId}`))
      );
    }
    return { answerHashes };
  }

  // Generate signature for joinGame
  async function generateJoinSignature(signer, playerAddress, basename, gameId) {
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "string", "uint256"],
        [playerAddress, basename, gameId]
      )
    );
    const signature = await signer.signMessage(ethers.getBytes(messageHash));
    return signature;
  }

  // Generate signature for submitAnswers
  async function generateAnswerSignature(signer, gameId, playerAddress, stage, score, answerHashes) {
    const messageHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "uint256", "bytes32[]"],
        [gameId, playerAddress, stage, score, answerHashes]
      )
    );
    const signature = await signer.signMessage(ethers.getBytes(messageHash));
    return signature;
  }

  beforeEach(async function () {
    [owner, creator, player1, player2, player3, player4, platform, backendSigner] = await ethers.getSigners();

    // Deploy MockBasenameResolver
    const MockBasenameResolver = await ethers.getContractFactory("MockBasenameResolver");
    basenameResolver = await MockBasenameResolver.deploy();
    await basenameResolver.waitForDeployment();

    // Set resolved addresses
    await basenameResolver.setResolvedAddress(creatorBasenameNode, creator.address);
    await basenameResolver.setResolvedAddress(ethers.keccak256(ethers.toUtf8Bytes(player1Basename)), player1.address);
    await basenameResolver.setResolvedAddress(ethers.keccak256(ethers.toUtf8Bytes(player2Basename)), player2.address);
    await basenameResolver.setResolvedAddress(ethers.keccak256(ethers.toUtf8Bytes(player3Basename)), player3.address);
    await basenameResolver.setResolvedAddress(ethers.keccak256(ethers.toUtf8Bytes(player4Basename)), player4.address);

    // Deploy DTAIOCToken
    DTAIOCToken = await ethers.getContractFactory("DTAIOCToken");
    token = await DTAIOCToken.deploy();
    await token.waitForDeployment();

    // Deploy DTAIOCNFT
    DTAIOCNFT = await ethers.getContractFactory("DTAIOCNFT");
    nft = await DTAIOCNFT.deploy();
    await nft.waitForDeployment();

    // Deploy DTAIOCStaking
    DTAIOCStaking = await ethers.getContractFactory("DTAIOCStaking");
    staking = await DTAIOCStaking.deploy(token.target, platform.address);
    await staking.waitForDeployment();

    // Deploy DTAIOCGame
    DTAIOCGame = await ethers.getContractFactory("DTAIOCGame");
    game = await DTAIOCGame.deploy(
      token.target,
      nft.target,
      staking.target,
      basenameResolver.target,
      backendSigner.address,
      platform.address
    );
    await game.waitForDeployment();

    // Configure permissions
    await nft.setGameContract(game.target);
    await staking.setGameContract(game.target);

    // Mint tokens and approve staking
    for (const player of [player1, player2, player3, player4]) {
      await token.connect(player).mint(stakeAmount);
      await token.connect(player).approve(staking.target, stakeAmount);
    }

    // Reset hashCounter for each test
    hashCounter = 0;
  });

  describe("Initial Setup", function () {
    it("Should have correct initial setup", async function () {
      expect(await game.token()).to.equal(token.target);
      expect(await game.nft()).to.equal(nft.target);
      expect(await game.staking()).to.equal(staking.target);
      expect(await game.basenameResolver()).to.equal(basenameResolver.target);
      expect(await game.backendSigner()).to.equal(backendSigner.address);
      expect(await game.gameCounter()).to.equal(0n);
      expect(await game.STAKE_AMOUNT()).to.equal(stakeAmount);
      expect(await game.NFT_TOKEN_URI()).to.equal(tokenURI);
      expect(await game.owner()).to.equal(owner.address);
    });
  });

  describe("Game Creation", function () {
    it("Should allow creator with Basename to create game with question hashes and duration", async function () {
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      const tx = await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);
      const gameId = 1;
      await expect(tx).to.emit(game, "GameCreated").withArgs(gameId, creator.address, creatorBasenameNode);

      const gameData = await game.games(gameId);
      expect(gameData.creator).to.equal(creator.address);
      expect(gameData.basenameNode).to.equal(creatorBasenameNode);
      expect(gameData.stage).to.equal(1n);
      expect(gameData.startTime).to.be.gt(0);
      expect(gameData.gameDuration).to.equal(gameDuration);
      expect(gameData.playerCount).to.equal(0n);
      expect(gameData.ended).to.equal(false);
      expect(gameData.questionRootHashes).to.deep.equal(questionRootHashes);
      expect(gameData.perfectScorers).to.deep.equal([]);
    });

    it("Should revert game creation without valid Basename", async function () {
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await expect(
        game.connect(player1).createGame(creatorBasenameNode, questionRootHashes, gameDuration)
      ).to.be.revertedWith("Caller does not own Basename");
    });

    it("Should revert game creation with invalid question hashes", async function () {
      const invalidHashes = [
        ethers.ZeroHash,
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_${hashCounter++}`))
      ];
      await expect(
        game.connect(creator).createGame(creatorBasenameNode, invalidHashes, gameDuration)
      ).to.be.revertedWith("Invalid question hash");
    });

    it("Should revert game creation with duplicate question hashes", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes(`stage_${hashCounter++}`));
      const duplicateHashes = [hash, hash, ethers.keccak256(ethers.toUtf8Bytes(`stage3_${hashCounter++}`))];
      await expect(
        game.connect(creator).createGame(creatorBasenameNode, duplicateHashes, gameDuration)
      ).to.be.revertedWith("Duplicate question hash");
    });

    it("Should revert game creation with invalid duration", async function () {
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await expect(
        game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, 3600 * 25)
      ).to.be.revertedWith("Invalid game duration");
    });
  });

  describe("Joining Game", function () {
    let gameId = 1;
    let questionRootHashes;

    beforeEach(async function () {
      questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);
    });

    it("Should generate valid signature", async function () {
      const messageHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "string", "uint256"],
          [player1.address, player1Basename, gameId]
        )
      );
      const ethSignedMessageHash = ethers.hashMessage(ethers.getBytes(messageHash));
      const signature = await generateJoinSignature(backendSigner, player1.address, player1Basename, gameId);
      const recovered = ethers.recoverAddress(ethSignedMessageHash, signature);
      expect(recovered).to.equal(backendSigner.address);
    });

    it("Should allow players to join game with valid Basename and signature", async function () {
      const signature = await generateJoinSignature(backendSigner, player1.address, player1Basename, gameId);
      const tx = await game.connect(player1).joinGame(gameId, player1Basename, signature);

      await expect(tx).to.emit(game, "PlayerJoined").withArgs(gameId, player1.address, player1Basename);

      const gameData = await game.games(gameId);
      expect(gameData.playerCount).to.equal(1n);

      expect(await staking.playerStakes(gameId, player1.address)).to.equal(stakeAmount);
      expect(await token.balanceOf(player1.address)).to.equal(0);

      const playerData = await game.getPlayer(gameId, player1.address);
      expect(playerData.basename).to.equal(player1Basename);
      expect(playerData.currentStage).to.equal(1n);
      expect(playerData.score).to.equal(0n);
      expect(playerData.completionTime).to.equal(0n);
    });

    it("Should revert joining with invalid Basename", async function () {
      const signature = await generateJoinSignature(backendSigner, player1.address, player2Basename, gameId);
      await expect(
        game.connect(player1).joinGame(gameId, player2Basename, signature)
      ).to.be.revertedWith("Basename does not resolve to caller");
    });

    it("Should revert joining with invalid signature", async function () {
      const wrongSigner = owner;
      const signature = await generateJoinSignature(wrongSigner, player1.address, player1Basename, gameId);
      await expect(
        game.connect(player1).joinGame(gameId, player1Basename, signature)
      ).to.be.revertedWith("Invalid signature");
    });

    it("Should revert joining non-existent game", async function () {
      const signature = await generateJoinSignature(backendSigner, player1.address, player1Basename, gameId + 1);
      await expect(
        game.connect(player1).joinGame(gameId + 1, player1Basename, signature)
      ).to.be.revertedWith("Game does not exist");
    });

    it("Should revert joining ended game", async function () {
      const signature = await generateJoinSignature(backendSigner, player1.address, player1Basename, gameId);
      await game.connect(player1).joinGame(gameId, player1Basename, signature);
      await ethers.provider.send("evm_increaseTime", [gameDuration + 1]);
      await ethers.provider.send("evm_mine");
      await game.connect(owner).endGame(gameId);

      const newSignature = await generateJoinSignature(backendSigner, player2.address, player2Basename, gameId);
      await expect(
        game.connect(player2).joinGame(gameId, player2Basename, newSignature)
      ).to.be.revertedWith("Game has ended");
    });

    it("Should revert joining with insufficient balance", async function () {
      await token.connect(player1).transfer(player2.address, stakeAmount);
      const signature = await generateJoinSignature(backendSigner, player1.address, player1Basename, gameId);
      await expect(
        game.connect(player1).joinGame(gameId, player1Basename, signature)
      ).to.be.revertedWith("Insufficient balance");
    });

    it("Should revert joining with insufficient allowance", async function () {
      await token.connect(player1).approve(staking.target, 0);
      const signature = await generateJoinSignature(backendSigner, player1.address, player1Basename, gameId);
      await expect(
        game.connect(player1).joinGame(gameId, player1Basename, signature)
      ).to.be.revertedWith("Insufficient allowance");
    });

    it("Should revert joining twice", async function () {
      const signature = await generateJoinSignature(backendSigner, player1.address, player1Basename, gameId);
      await game.connect(player1).joinGame(gameId, player1Basename, signature);
      await expect(
        game.connect(player1).joinGame(gameId, player1Basename, signature)
      ).to.be.revertedWith("Player already joined");
    });

    it("Should revert joining after game duration", async function () {
      const signature = await generateJoinSignature(backendSigner, player1.address, player1Basename, gameId);
      await ethers.provider.send("evm_increaseTime", [gameDuration + 1]);
      await ethers.provider.send("evm_mine");
      await expect(
        game.connect(player1).joinGame(gameId, player1Basename, signature)
      ).to.be.revertedWith("Game duration exceeded");
    });
  });

  describe("Submitting Answers", function () {
    let gameId, stage1Answers, stage2Answers, stage3Answers, stage1Fail, stage2Fail, stage3Fail;

    beforeEach(async function () {
      gameId = Number(await game.gameCounter()) + 1;
      stage1Answers = await generateAnswerHashes(5, 1);
      stage2Answers = await generateAnswerHashes(5, 2);
      stage3Answers = await generateAnswerHashes(5, 3);
      stage1Fail = await generateAnswerHashes(3, 1);
      stage2Fail = await generateAnswerHashes(3, 2);
      stage3Fail = await generateAnswerHashes(3, 3);
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);
      const signature = await generateJoinSignature(backendSigner, player1.address, player1Basename, gameId);
      await game.connect(player1).joinGame(gameId, player1Basename, signature);
    });

    it("Should allow player to submit answers and advance stage", async function () {
      const answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );

      const tx = await game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature);
      await expect(tx)
        .to.emit(game, "StageCompleted")
        .withArgs(gameId, player1.address, 1, 5, player1Basename, 0);

      const playerData = await game.getPlayer(gameId, player1.address);
      expect(playerData.currentStage).to.equal(2n);
      expect(playerData.score).to.equal(5n);
      expect(playerData.completionTime).to.equal(0n);
    });

    it("Should end quiz for player with score < 5 and refund", async function () {
      const answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        3,
        stage1Fail.answerHashes
      );

      const tx = await game.connect(player1).submitAnswers(gameId, 1, stage1Fail.answerHashes, 3, answerSignature);
      await expect(tx)
        .to.emit(game, "PlayerEliminated")
        .withArgs(gameId, player1.address, 1, 3, player1Basename);

      expect(await token.balanceOf(player1.address)).to.equal(0); // 0% refund for stage 1
      expect(await game.isPlayerInGame(gameId, player1.address)).to.equal(true); // Player data retained
      const gameData = await game.games(gameId);
      expect(gameData.playerCount).to.equal(0n);
    });

    it("Should record completion time for Stage 3 perfect score", async function () {
      let answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature);
      await game.connect(owner).advanceStage(gameId); // Stage 2

      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        2,
        5,
        stage2Answers.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 2, stage2Answers.answerHashes, 5, answerSignature);
      await game.connect(owner).advanceStage(gameId); // Stage 3

      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        3,
        5,
        stage3Answers.answerHashes
      );

      const tx = await game.connect(player1).submitAnswers(gameId, 3, stage3Answers.answerHashes, 5, answerSignature);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(game, "StageCompleted")
        .withArgs(gameId, player1.address, 3, 5, player1Basename, block.timestamp);

      const gameData = await game.games(gameId);
      expect(gameData.perfectScorers).to.deep.equal([player1.address]);
      const playerData = await game.getPlayer(gameId, player1.address);
      expect(playerData.completionTime).to.equal(block.timestamp);
    });

    it("Should revert submitAnswers for non-existent game", async function () {
      const answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId + 1,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await expect(
        game.connect(player1).submitAnswers(gameId + 1, 1, stage1Answers.answerHashes, 5, answerSignature)
      ).to.be.revertedWith("Game does not exist");
    });

    it("Should revert submitAnswers for ended game", async function () {
      await ethers.provider.send("evm_increaseTime", [gameDuration + 1]);
      await ethers.provider.send("evm_mine");
      await game.connect(owner).endGame(gameId);

      const answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await expect(
        game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature)
      ).to.be.revertedWith("Game has ended");
    });

    it("Should revert submitAnswers for non-player", async function () {
      const answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player2.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await expect(
        game.connect(player2).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature)
      ).to.be.revertedWith("Player eliminated");
    });

    it("Should revert submitAnswers for invalid stage", async function () {
      const answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        4,
        5,
        stage1Answers.answerHashes
      );
      await expect(
        game.connect(player1).submitAnswers(gameId, 4, stage1Answers.answerHashes, 5, answerSignature)
      ).to.be.revertedWith("Invalid stage");
    });

    it("Should revert submitAnswers for inactive stage", async function () {
      await game.connect(owner).advanceStage(gameId); // Stage 2
      const answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await expect(
        game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature)
      ).to.be.revertedWith("Stage not active");
    });

    it("Should revert submitAnswers for wrong player stage", async function () {
      await game.connect(owner).advanceStage(gameId); // Stage 2
      const answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        2,
        5,
        stage2Answers.answerHashes
      );
      await expect(
        game.connect(player1).submitAnswers(gameId, 2, stage2Answers.answerHashes, 5, answerSignature)
      ).to.be.revertedWith("Player not in stage");
    });

    it("Should revert submitAnswers if already submitted", async function () {
      const answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature);
      await expect(
        game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature)
      ).to.be.revertedWith("Answers already submitted");
    });

    it("Should revert submitAnswers with invalid signature", async function () {
      const answerSignature = await generateAnswerSignature(
        owner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await expect(
        game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature)
      ).to.be.revertedWith("Invalid signature");
    });

    it("Should revert submitAnswers after game duration", async function () {
      const answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );

      await ethers.provider.send("evm_increaseTime", [gameDuration + 1]);
      await ethers.provider.send("evm_mine");

      await expect(
        game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature)
      ).to.be.revertedWith("Game duration exceeded");
    });

    it("Should revert submitAnswers for player after quiz ended", async function () {
      let answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        3,
        stage1Fail.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 1, stage1Fail.answerHashes, 3, answerSignature);
      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await expect(
        game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature)
      ).to.be.revertedWith("Player eliminated");
    });

    it("Should refund 30% for stage 2 elimination after stage 1 perfect score", async function () {
      let answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature);
      await game.connect(owner).advanceStage(gameId); // Stage 2

      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        2,
        3,
        stage2Fail.answerHashes
      );
      const tx = await game.connect(player1).submitAnswers(gameId, 2, stage2Fail.answerHashes, 3, answerSignature);
      await expect(tx)
        .to.emit(game, "PlayerEliminated")
        .withArgs(gameId, player1.address, 2, 3, player1Basename);

      expect(await token.balanceOf(player1.address)).to.equal(ethers.parseEther("3")); // 30% refund
      expect(await game.isPlayerInGame(gameId, player1.address)).to.equal(true); // Player data retained
      const gameData = await game.games(gameId);
      expect(gameData.playerCount).to.equal(0n);
    });

    it("Should refund 70% for stage 3 elimination after stage 1 & 2 perfect scores", async function () {
      let answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature);
      await game.connect(owner).advanceStage(gameId); // Stage 2

      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        2,
        5,
        stage2Answers.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 2, stage2Answers.answerHashes, 5, answerSignature);
      await game.connect(owner).advanceStage(gameId); // Stage 3

      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        3,
        3,
        stage3Fail.answerHashes
      );
      const tx = await game.connect(player1).submitAnswers(gameId, 3, stage3Fail.answerHashes, 3, answerSignature);
      await expect(tx)
        .to.emit(game, "PlayerEliminated")
        .withArgs(gameId, player1.address, 3, 3, player1Basename);

      expect(await token.balanceOf(player1.address)).to.equal(ethers.parseEther("7")); // 70% refund
      expect(await game.isPlayerInGame(gameId, player1.address)).to.equal(true); // Player data retained
      const gameData = await game.games(gameId);
      expect(gameData.playerCount).to.equal(0n);
    });
  });

  describe("Leaderboard", function () {
    let gameId;

    it("Should return correct leaderboard data", async function () {
      gameId = Number(await game.gameCounter()) + 1;
      const stage1Answers = await generateAnswerHashes(5, 1);
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);
      const signatures = await Promise.all([
        generateJoinSignature(backendSigner, player1.address, player1Basename, gameId),
        generateJoinSignature(backendSigner, player2.address, player2Basename, gameId)
      ]);

      await game.connect(player1).joinGame(gameId, player1Basename, signatures[0]);
      await game.connect(player2).joinGame(gameId, player2Basename, signatures[1]);

      const answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature);

      const gameData = await game.games(gameId);
      expect(gameData.playerCount).to.equal(2n);

      const player1Data = await game.getPlayer(gameId, player1.address);
      const player2Data = await game.getPlayer(gameId, player2.address);

      expect(player1Data.basename).to.equal(player1Basename);
      expect(player1Data.currentStage).to.equal(2n);
      expect(player1Data.score).to.equal(5n);
      expect(player1Data.completionTime).to.equal(0n);

      expect(player2Data.basename).to.equal(player2Basename);
      expect(player2Data.currentStage).to.equal(1n);
      expect(player2Data.score).to.equal(0n);
      expect(player2Data.completionTime).to.equal(0n);
    });

    it("Should revert getLeaderboardData for non-existent game", async function () {
      await expect(game.getLeaderboardData(2)).to.be.revertedWith("Game does not exist");
    });
  });

  describe("Stage Advancement", function () {
    let gameId;

    beforeEach(async function () {
      gameId = Number(await game.gameCounter()) + 1;
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);
    });

    it("Should allow owner to advance stage", async function () {
      const tx = await game.connect(owner).advanceStage(gameId);
      await expect(tx).to.emit(game, "StageAdvanced").withArgs(gameId, 2);

      const gameData = await game.games(gameId);
      expect(gameData.stage).to.equal(2n);
    });

    it("Should revert advanceStage by non-owner", async function () {
      await expect(
        game.connect(player1).advanceStage(gameId)
      ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount").withArgs(player1.address);
    });

    it("Should revert advanceStage for non-existent game", async function () {
      await expect(
        game.connect(owner).advanceStage(gameId + 1)
      ).to.be.revertedWith("Game does not exist");
    });

    it("Should revert advanceStage for ended game", async function () {
      await ethers.provider.send("evm_increaseTime", [gameDuration + 1]);
      await ethers.provider.send("evm_mine");
      await game.connect(owner).endGame(gameId);

      await expect(
        game.connect(owner).advanceStage(gameId)
      ).to.be.revertedWith("Game has ended");
    });

    it("Should revert advanceStage at final stage", async function () {
      await game.connect(owner).advanceStage(gameId); // Stage 2
      await game.connect(owner).advanceStage(gameId); // Stage 3
      await game.connect(owner).advanceStage(gameId); // Stage 4
      await expect(
        game.connect(owner).advanceStage(gameId)
      ).to.be.revertedWith("Game at final stage");
    });
  });

  describe("Player Refund", function () {
    let gameId;

    beforeEach(async function () {
      gameId = Number(await game.gameCounter()) + 1;
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);
      const signature = await generateJoinSignature(backendSigner, player1.address, player1Basename, gameId);
      await game.connect(player1).joinGame(gameId, player1Basename, signature);
    });

    it("Should allow owner to refund player", async function () {
      const stage1Answers = await generateAnswerHashes(5, 1);
      let answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature);
      await game.connect(owner).advanceStage(gameId); // Stage 2

      const balanceBefore = await token.balanceOf(player1.address);
      const tx = await game.connect(owner).refundPlayer(gameId, player1.address);
      await expect(tx)
        .to.emit(game, "PlayerEliminated")
        .withArgs(gameId, player1.address, 2, 0, player1Basename);

      const gameData = await game.games(gameId);
      expect(gameData.playerCount).to.equal(0n);
      expect(await token.balanceOf(player1.address)).to.equal(ethers.parseEther("3")); // 30% refund for Stage 2
      expect(await game.isPlayerInGame(gameId, player1.address)).to.equal(false);
    });

    it("Should revert refund for non-existent game", async function () {
      await expect(
        game.connect(owner).refundPlayer(gameId + 1, player1.address)
      ).to.be.revertedWith("Game does not exist");
    });

    it("Should revert refund for non-player", async function () {
      await expect(
        game.connect(owner).refundPlayer(gameId, player2.address)
      ).to.be.revertedWith("Player not in game");
    });
  });

  describe("Game Ending", function () {
    let gameId;

    beforeEach(async function () {
      gameId = Number(await game.gameCounter()) + 1;
    });

    it("Should allow owner to end game and select winners from perfect scorers", async function () {
      const stage1Answers = await generateAnswerHashes(5, 1);
      const stage2Answers = await generateAnswerHashes(5, 2);
      const stage3Answers = await generateAnswerHashes(5, 3);
      const stage2Fail = await generateAnswerHashes(3, 2);
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);
      const signatures = await Promise.all([
        generateJoinSignature(backendSigner, player1.address, player1Basename, gameId),
        generateJoinSignature(backendSigner, player2.address, player2Basename, gameId),
        generateJoinSignature(backendSigner, player3.address, player3Basename, gameId),
        generateJoinSignature(backendSigner, player4.address, player4Basename, gameId)
      ]);

      await game.connect(player1).joinGame(gameId, player1Basename, signatures[0]);
      await game.connect(player2).joinGame(gameId, player2Basename, signatures[1]);
      await game.connect(player3).joinGame(gameId, player3Basename, signatures[2]);
      await game.connect(player4).joinGame(gameId, player4Basename, signatures[3]);

      // All players complete Stage 1
      let answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature);
      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player2.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await game.connect(player2).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature);
      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player3.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await game.connect(player3).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature);
      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player4.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await game.connect(player4).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature);
      await game.connect(owner).advanceStage(gameId); // Stage 2

      // Players 1, 2, 3 complete Stage 2, Player 4 fails
      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        2,
        5,
        stage2Answers.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 2, stage2Answers.answerHashes, 5, answerSignature);
      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player2.address,
        2,
        5,
        stage2Answers.answerHashes
      );
      await game.connect(player2).submitAnswers(gameId, 2, stage2Answers.answerHashes, 5, answerSignature);
      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player3.address,
        2,
        5,
        stage2Answers.answerHashes
      );
      await game.connect(player3).submitAnswers(gameId, 2, stage2Answers.answerHashes, 5, answerSignature);
      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player4.address,
        2,
        3,
        stage2Fail.answerHashes
      );
      await game.connect(player4).submitAnswers(gameId, 2, stage2Fail.answerHashes, 3, answerSignature);
      await game.connect(owner).advanceStage(gameId); // Stage 3

      // Players 1, 2, 3 complete Stage 3
      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        3,
        5,
        stage3Answers.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 3, stage3Answers.answerHashes, 5, answerSignature);
      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player2.address,
        3,
        5,
        stage3Answers.answerHashes
      );
      await game.connect(player2).submitAnswers(gameId, 3, stage3Answers.answerHashes, 5, answerSignature);
      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player3.address,
        3,
        5,
        stage3Answers.answerHashes
      );
      await game.connect(player3).submitAnswers(gameId, 3, stage3Answers.answerHashes, 5, answerSignature);

      await ethers.provider.send("evm_increaseTime", [gameDuration + 1]);
      await ethers.provider.send("evm_mine");

      const tx = await game.connect(owner).endGame(gameId);
      await expect(tx)
        .to.emit(game, "GameEnded")
        .withArgs(gameId, [player1.address, player2.address, player3.address]);

      // Player 4 forfeited 7 ETH (10 - 3 refunded)
      const forfeited = ethers.parseEther("7");
      const winnerShare = forfeited * 20n / 100n; // 1.4 ETH
      expect(await token.balanceOf(player1.address)).to.equal(ethers.parseEther("10") + winnerShare); // 100% refund + 20%
      expect(await token.balanceOf(player2.address)).to.equal(ethers.parseEther("10") + winnerShare); // 100% refund + 20%
      expect(await token.balanceOf(player3.address)).to.equal(ethers.parseEther("10") + winnerShare); // 100% refund + 20%
      expect(await token.balanceOf(creator.address)).to.equal(winnerShare); // 20%
      expect(await token.balanceOf(platform.address)).to.equal(winnerShare); // 20%
      expect(await token.balanceOf(player4.address)).to.equal(ethers.parseEther("3")); // 30% refund

      expect(await nft.ownerOf(1)).to.equal(player1.address);
      expect(await nft.ownerOf(2)).to.equal(player2.address);
      expect(await nft.ownerOf(3)).to.equal(player3.address);
      expect(await nft.tokenURI(1)).to.equal(tokenURI);
    });

    it("Should allow owner to end game with no perfect scorers", async function () {
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);
      const signature = await generateJoinSignature(backendSigner, player1.address, player1Basename, gameId);
      await game.connect(player1).joinGame(gameId, player1Basename, signature);

      await ethers.provider.send("evm_increaseTime", [gameDuration + 1]);
      await ethers.provider.send("evm_mine");

      const tx = await game.connect(owner).endGame(gameId);
      await expect(tx)
        .to.emit(game, "GameEnded")
        .withArgs(gameId, [ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress]);

      expect(await token.balanceOf(player1.address)).to.equal(0);
    });

    it("Should allow owner to auto-end game after duration", async function () {
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);

      await ethers.provider.send("evm_increaseTime", [gameDuration + 1]);
      await ethers.provider.send("evm_mine");

      const tx = await game.connect(owner).autoEndGame(gameId);
      await expect(tx)
        .to.emit(game, "GameEnded")
        .withArgs(gameId, [ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress]);
    });

    it("Should revert autoEndGame before duration", async function () {
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);
      await expect(
        game.connect(owner).autoEndGame(gameId)
      ).to.be.revertedWith("Game duration not reached");
    });

    it("Should revert endGame by non-owner", async function () {
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);
      await ethers.provider.send("evm_increaseTime", [gameDuration + 1]);
      await ethers.provider.send("evm_mine");
      await expect(
        game.connect(player1).endGame(gameId)
      ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount").withArgs(player1.address);
    });

    it("Should revert endGame for non-existent game", async function () {
      await expect(
        game.connect(owner).endGame(gameId + 1)
      ).to.be.revertedWith("Game does not exist");
    });

    it("Should revert endGame for already ended game", async function () {
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);
      await ethers.provider.send("evm_increaseTime", [gameDuration + 1]);
      await ethers.provider.send("evm_mine");
      await game.connect(owner).endGame(gameId);

      await expect(
        game.connect(owner).endGame(gameId)
      ).to.be.revertedWith("Game already ended");
    });

    it("Should revert endGame before duration", async function () {
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);
      await expect(
        game.connect(owner).endGame(gameId)
      ).to.be.revertedWith("Game duration not reached");
    });
  });

  describe("Player Limit", function () {
    let gameId, stage1Answers, stage2Fail;

    beforeEach(async function () {
      gameId = Number(await game.gameCounter()) + 1;
      stage1Answers = await generateAnswerHashes(5, 1);
      stage2Fail = await generateAnswerHashes(3, 2);
      const questionRootHashes = [
        ethers.keccak256(ethers.toUtf8Bytes(`stage1_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage2_questions_${hashCounter++}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`stage3_questions_${hashCounter++}`))
      ];
      await game.connect(creator).createGame(creatorBasenameNode, questionRootHashes, gameDuration);
    });

    it("Should allow new players to join after quiz ends for a player", async function () {
      const signatures = await Promise.all([
        generateJoinSignature(backendSigner, player1.address, player1Basename, gameId),
        generateJoinSignature(backendSigner, player2.address, player2Basename, gameId)
      ]);

      await game.connect(player1).joinGame(gameId, player1Basename, signatures[0]);
      let answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        1,
        5,
        stage1Answers.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 1, stage1Answers.answerHashes, 5, answerSignature);
      await game.connect(owner).advanceStage(gameId); // Stage 2

      answerSignature = await generateAnswerSignature(
        backendSigner,
        gameId,
        player1.address,
        2,
        3,
        stage2Fail.answerHashes
      );
      await game.connect(player1).submitAnswers(gameId, 2, stage2Fail.answerHashes, 3, answerSignature);

      const gameData = await game.games(gameId);
      expect(gameData.playerCount).to.equal(0n);

      await game.connect(player2).joinGame(gameId, player2Basename, signatures[1]);

      const updatedGameData = await game.games(gameId);
      expect(updatedGameData.playerCount).to.equal(1n);
      expect(await game.isPlayerInGame(gameId, player2.address)).to.equal(true);
    });

    it("Should revert joining when player limit is reached", async function () {
      const signature = await generateJoinSignature(backendSigner, player2.address, player2Basename, gameId);

      // Set playerCount to 100 (PLAYER_LIMIT) at slot gamesData[gameId] + 5
      const gameSlot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [gameId]));
      const playerCountSlot = `0x${(BigInt(gameSlot) + 5n).toString(16).padStart(64, '0')}`;
      console.log("Setting playerCount slot:", playerCountSlot);
      await ethers.provider.send("hardhat_setStorageAt", [
        game.target,
        playerCountSlot,
        ethers.toBeHex(100, 32)
      ]);

      await expect(
        game.connect(player2).joinGame(gameId, player2Basename, signature)
      ).to.be.revertedWith("Player limit reached");
    });
  });

  describe("Backend Signer", function () {
    it("Should allow owner to update backend signer", async function () {
      await game.connect(owner).setBackendSigner(player1.address);
      expect(await game.backendSigner()).to.equal(player1.address);
    });

    it("Should revert setBackendSigner by non-owner", async function () {
      await expect(
        game.connect(player1).setBackendSigner(player1.address)
      ).to.be.revertedWithCustomError(game, "OwnableUnauthorizedAccount").withArgs(player1.address);
    });

    it("Should revert setBackendSigner with zero address", async function () {
      await expect(
        game.connect(owner).setBackendSigner(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid backend signer address");
    });
  });
});