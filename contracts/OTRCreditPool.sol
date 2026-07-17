// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title OTRCreditPool
 * @notice Accepts $OTR token payments and emits CreditPurchased events.
 *         The OUTRIVE backend listens for these events to grant AI chat credits.
 *
 * Tiers:
 *   0 = STARTER  — 100 OTR → 10 chats
 *   1 = BUILDER  — 450 OTR → 50 chats
 *   2 = OPERATOR — 1600 OTR → 200 chats
 *   3 = CUSTOM   — 10 OTR × chatCount, minimum 5 chats
 */
contract OTRCreditPool {
    address public owner;
    IERC20 public immutable otrToken;

    // ── Pricing (in OTR, 18 decimals) ─────────────────────────────────────────
    uint256 public starterPrice    = 100 ether;   // 100 OTR → 10 chats
    uint256 public builderPrice    = 450 ether;   // 450 OTR → 50 chats
    uint256 public operatorPrice   = 1600 ether;  // 1600 OTR → 200 chats
    uint256 public customRatePerChat = 10 ether;  // 10 OTR per chat
    uint256 public customMinChats  = 5;

    // ── Chat amounts per tier ──────────────────────────────────────────────────
    uint256 public constant STARTER_CHATS  = 10;
    uint256 public constant BUILDER_CHATS  = 50;
    uint256 public constant OPERATOR_CHATS = 200;

    // ── Events ─────────────────────────────────────────────────────────────────
    event CreditPurchased(
        address indexed buyer,
        uint256 otrAmount,
        uint256 chatsGranted,
        uint8   tier
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "OTRCreditPool: not owner");
        _;
    }

    constructor(address _otrToken) {
        require(_otrToken != address(0), "OTRCreditPool: zero token address");
        owner    = msg.sender;
        otrToken = IERC20(_otrToken);
    }

    // ── Purchase functions ─────────────────────────────────────────────────────

    /**
     * @notice Purchase a fixed tier. Caller must have approved this contract
     *         to spend the required OTR amount before calling.
     * @param tier 0=STARTER, 1=BUILDER, 2=OPERATOR
     */
    function purchaseTier(uint8 tier) external {
        uint256 otrAmount;
        uint256 chatsGranted;

        if (tier == 0) {
            otrAmount    = starterPrice;
            chatsGranted = STARTER_CHATS;
        } else if (tier == 1) {
            otrAmount    = builderPrice;
            chatsGranted = BUILDER_CHATS;
        } else if (tier == 2) {
            otrAmount    = operatorPrice;
            chatsGranted = OPERATOR_CHATS;
        } else {
            revert("OTRCreditPool: invalid tier");
        }

        require(
            otrToken.transferFrom(msg.sender, address(this), otrAmount),
            "OTRCreditPool: transfer failed"
        );
        emit CreditPurchased(msg.sender, otrAmount, chatsGranted, tier);
    }

    /**
     * @notice Purchase a custom number of chats (minimum customMinChats).
     *         Rate: customRatePerChat OTR per chat.
     * @param chatCount Number of chats to purchase
     */
    function purchaseCustom(uint256 chatCount) external {
        require(chatCount >= customMinChats, "OTRCreditPool: below minimum chats");
        uint256 otrAmount = chatCount * customRatePerChat;
        require(
            otrToken.transferFrom(msg.sender, address(this), otrAmount),
            "OTRCreditPool: transfer failed"
        );
        emit CreditPurchased(msg.sender, otrAmount, chatCount, 3);
    }

    // ── View helpers ───────────────────────────────────────────────────────────

    function getTierPrice(uint8 tier) external view returns (uint256 otrAmount, uint256 chats) {
        if (tier == 0) return (starterPrice, STARTER_CHATS);
        if (tier == 1) return (builderPrice, BUILDER_CHATS);
        if (tier == 2) return (operatorPrice, OPERATOR_CHATS);
        revert("OTRCreditPool: invalid tier");
    }

    function getCustomPrice(uint256 chatCount) external view returns (uint256 otrAmount) {
        require(chatCount >= customMinChats, "OTRCreditPool: below minimum chats");
        return chatCount * customRatePerChat;
    }

    // ── Owner functions ────────────────────────────────────────────────────────

    function setRates(
        uint256 _starter,
        uint256 _builder,
        uint256 _operator,
        uint256 _customRate,
        uint256 _minChats
    ) external onlyOwner {
        require(_starter > 0 && _builder > 0 && _operator > 0 && _customRate > 0, "Zero price");
        starterPrice     = _starter;
        builderPrice     = _builder;
        operatorPrice    = _operator;
        customRatePerChat= _customRate;
        customMinChats   = _minChats;
    }

    function withdrawOTR(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero address");
        require(otrToken.transfer(to, amount), "OTRCreditPool: transfer failed");
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
