// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./MerkleTreeWithHistory.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "hardhat/console.sol";

interface IVerifier {
    // (Verifier code deployed on Sepolia at: 0x44053158940898135D48f927A358d6Db91337F4D (by me!)
    function verifyProof(
        bytes memory _proof,
        uint256[6] memory _input
    ) external returns (bool);
}

abstract contract Tornado is MerkleTreeWithHistory, ReentrancyGuard {
    IVerifier public immutable verifier;
    // uint256 public denomination; // is the tokenID (nftID) not necessary

    mapping(bytes32 => bool) public nullifierHashes;
    // we store all commitments just to prevent accidental deposits with the same commitment
    mapping(bytes32 => bool) public commitments;

    event Deposit(
        bytes32 indexed commitment,
        uint32 leafIndex,
        uint256 timestamp
    );
    event Withdrawal(
        address to,
        bytes32 nullifierHash,
        address indexed relayer,
        uint256 fee
    );

    /*
    @dev The constructor
    @param _verifier the address of SNARK verifier for this contract// 0x44053158940898135D48f927A358d6Db91337F4D (deployed at sepolia)
    @param _hasher the address of MiMC hash contract //0x01B4e4e6E468Bb7f55101cfFfB8cF7aB4b09C6a9 (use "the same" at sepolia)
    @param _denomination transfer amount for each deposit // is the tokenID (nftID) not necessary here.
    @param _merkleTreeHeight the height of deposits' Merkle Tree// (let fix at 20).
  */
    constructor(
        IVerifier _verifier,
        IHasher _hasher,
        // uint256 _denomination,
        uint32 _merkleTreeHeight
    ) MerkleTreeWithHistory(_merkleTreeHeight, _hasher) {
        // require(_denomination > 0, "denomination should be greater than 0");
        verifier = _verifier;
        //  denomination = _denomination;
    }

    /**
    @dev Deposit funds into the contract. The caller must send (for ETH) or approve (for ERC20) value equal to or `denomination` of this instance.
    (In our case is NFT to deposit in the contract).
    @param _commitment the note commitment, which is PedersenHash(nullifier + secret)
  */
    function deposit(
        bytes32 _commitment,
        uint _denomination
    ) external payable nonReentrant {
        //added denomination to be used in the  _processDeposit
        require(!commitments[_commitment], "The commitment has been submitted");
        console.log("dentro Tornado");
        console.log(_denomination);

        uint32 insertedIndex = _insert(_commitment); // insert (at the MerkleTreeWithHistory) the commitment in the Merkle Tree.
        commitments[_commitment] = true; // to avoid double insertion (not really necessary).
        _processDeposit(_denomination); // dnomination is the NFT index

        emit Deposit(_commitment, insertedIndex, block.timestamp);
    }

    /** @dev this function is defined in a child contract */
    function _processDeposit(uint _denomination) internal virtual;

    /**
    @dev Withdraw a deposit from the contract. `proof` is a zkSNARK proof data, and input is an array of circuit public inputs
    `input` array consists of:
      - merkle root of all deposits in the contract
      - hash of unique deposit nullifier to prevent double spends
      - the recipient of funds (the new recipient of the NFT)
      - optional fee that goes to the transaction sender (usually a relay)... (I will not use this)
  */
    function withdraw(
        bytes calldata _proof,
        bytes32 _root,
        bytes32 _nullifierHash,
        /*
        quitado el payable...
        */
        address _recipient,
        address _relayer, // do not use this
        uint256 _fee, // do not use this
        uint256 _refund // do not use this
    ) external payable nonReentrant {
        //require(_fee <= denomination, "Fee exceeds transfer value"); //not using this.
        require(
            !nullifierHashes[_nullifierHash],
            "The note has been already spent"
        ); // veryfy if it already removed the NFT
        require(isKnownRoot(_root), "Cannot find your merkle root"); // Make sure to use a recent one
        require(
            verifier.verifyProof(
                _proof,
                [
                    uint256(_root),
                    uint256(_nullifierHash),
                    //add those:
                    uint256(uint160(_recipient)),
                    uint256(uint160(_relayer)),
                    //instead of the:
                    //uint256(_recipient),
                    //uint256(_relayer),
                    _fee,
                    _refund
                ]
            ),
            "Invalid withdraw proof"
        );

        nullifierHashes[_nullifierHash] = true;
        _processWithdraw(payable(_recipient));
        emit Withdrawal(_recipient, _nullifierHash, _relayer, _fee);
    }

    /** @dev this function is defined in a child contract */
    function _processWithdraw(address payable _recipient) internal virtual;

    /** @dev whether a note is already spent */
    function isSpent(bytes32 _nullifierHash) public view returns (bool) {
        return nullifierHashes[_nullifierHash];
    }

    /** @dev whether an array of notes is already spent */
    // function isSpentArray(
    //     // I will not use this too, but let it here for now...
    //     bytes32[] calldata _nullifierHashes
    // ) external view returns (bool[] memory spent) {
    //     spent = new bool[](_nullifierHashes.length);
    //     for (uint256 i = 0; i < _nullifierHashes.length; i++) {
    //         if (isSpent(_nullifierHashes[i])) {
    //             spent[i] = true;
    //         }
    //     }
    // }
}
