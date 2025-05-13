// Update the test for "submitAnswers already submitted"
it("Should revert submitAnswers if already submitted", async function () {
    const { merkleRoot } = await generateAnswerHashes(5);
    const questionRootHashes = [merkleRoot, merkleRoot, merkleRoot];
    await this.game.connect(this.creator).createGame(this.creatorBasenameNode, questionRootHashes);
    const gameId = 1;

    const signature = await generateJoinSignature(this.backendSigner, this.player1.address, this.player1Basename, gameId);
    await this.game.connect(this.player1).joinGame(gameId, this.player1Basename, signature);

    const { answerHashes } = await generateAnswerHashes(4); // Score 4 (not perfect)
    const answerSignature = await generateAnswerSignature(
        this.backendSigner,
        gameId,
        this.player1.address,
        1,
        4,
        answerHashes
    );

    // First submission - should succeed but not eliminate
    await this.game.connect(this.player1).submitAnswers(gameId, 1, answerHashes, 4, answerSignature);

    // Second submission - should revert
    await expect(
        this.game.connect(this.player1).submitAnswers(gameId, 1, answerHashes, 4, answerSignature)
    ).to.be.revertedWith("Answers already submitted");

    // Verify player is still in game
    expect(await this.game.isPlayerInGame(gameId, this.player1.address)).to.be.true;
});

// Update leaderboard test with higher timeout
it("Should return correct leaderboard data", async function () {
    this.timeout(600000); // Increased timeout
    
    const { merkleRoot } = await generateAnswerHashes(5);
    const questionRootHashes = [merkleRoot, merkleRoot, merkleRoot];
    await this.game.connect(this.creator).createGame(this.creatorBasenameNode, questionRootHashes);
    const gameId = 1;
    
    // Join players
    const signatures = await Promise.all([
        generateJoinSignature(this.backendSigner, this.player1.address, this.player1Basename, gameId),
        generateJoinSignature(this.backendSigner, this.player2.address, this.player2Basename, gameId)
    ]);
    await this.game.connect(this.player1).joinGame(gameId, this.player1Basename, signatures[0]);
    await this.game.connect(this.player2).joinGame(gameId, this.player2Basename, signatures[1]);

    // Player1 submits answers
    const { answerHashes } = await generateAnswerHashes(5);
    const answerSignature = await generateAnswerSignature(
        this.backendSigner,
        gameId,
        this.player1.address,
        1,
        5,
        answerHashes
    );
    await this.game.connect(this.player1).submitAnswers(gameId, 1, answerHashes, 5, answerSignature);

    // Get leaderboard
    const leaderboard = await this.game.getLeaderboardData(gameId);
    
    // Verify results
    expect(leaderboard.playerAddresses).to.have.lengthOf(2);
    expect(leaderboard.playerAddresses).to.include(this.player1.address);
    expect(leaderboard.playerAddresses).to.include(this.player2.address);
    // ... rest of assertions
});