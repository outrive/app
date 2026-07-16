// Temporary probe script — delete after use
// Uses raw eth_call via fetch to avoid ABI parsing issues

const RPC = "https://rpc.robinhoodchain.io";
const OTR   = "0xd1c26283f8cff7ce4e5bcd01203905ab3aba26ef";
const WETH9 = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const ZERO  = "0x0000000000000000000000000000000000000000";

// Function selectors (keccak256 of signature, first 4 bytes)
// V3 QuoterV2.quoteExactInputSingle(QuoteExactInputSingleParams) = 0xc6a5026a
// V2 getAmountsOut(uint256,address[]) = 0xd06ca61f
// V4 quoteExactInputSingle((PoolKey,bool,uint128,bytes)) - need to compute

const V3_QUOTER = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7";
const V4_QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94";
const V2_ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";

function hex(n, bytes) {
  return n.toString(16).padStart(bytes * 2, '0');
}

function padAddr(addr) {
  return '000000000000000000000000' + addr.slice(2).toLowerCase();
}

async function ethCall(to, data) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] })
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j.result;
}

const TEST_WEI = BigInt("1000000000000000"); // 0.001 ETH

// V3: quoteExactInputSingle(QuoteExactInputSingleParams)
// Params struct: tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96
// Selector: 0xc6a5026a
async function quoteV3(tokenIn, tokenOut, fee) {
  // V3 QuoterV2 quoteExactInputSingle takes a struct, encoded as tuple
  // (address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)
  const data = '0xc6a5026a' +
    padAddr(tokenIn) +        // tokenIn
    padAddr(tokenOut) +       // tokenOut
    hex(TEST_WEI, 32) +       // amountIn
    hex(fee, 32) +            // fee
    hex(0, 32);               // sqrtPriceLimitX96
  const result = await ethCall(V3_QUOTER, data);
  // Returns: amountOut (uint256), sqrtPriceX96After (uint160), initializedTicksCrossed (uint32), gasEstimate (uint256)
  return BigInt('0x' + result.slice(2, 66));
}

// V4 quoteExactInputSingle: selector 0xa4748667
// struct: ((address c0, address c1, uint24 fee, int24 ts, address hooks), bool zfi, uint128 exactAmount, bytes hookData)
// hookData is dynamic bytes — needs offset pointer
async function quoteV4(fee, tickSpacing, zeroForOne) {
  // The struct is: PoolKey(c0,c1,fee,ts,hooks), zfi, exactAmount, hookData(bytes)
  // PoolKey: 5 x 32 bytes
  // zfi: 1 x 32 bytes
  // exactAmount: 1 x 32 bytes
  // hookData: dynamic bytes (offset + length + data)
  
  const c0 = ZERO;
  const c1 = OTR;
  const hooks = ZERO;
  
  // ABI encoding: the outer struct contains a dynamic bytes field, so the struct itself is dynamic
  // Actually in Solidity, the entire params is a memory struct passed by value
  // The calldata encoding for a function taking a struct with dynamic members:
  // func(struct params) → data = selector + abi.encode(params)
  // Since hookData is bytes (dynamic), the struct is dynamic
  // So: offset to struct (0x20), then struct data
  
  // Actually for V4 Quoter, let's check the exact ABI encoding:
  // function quoteExactInputSingle(QuoteExactInputSingleParams memory params) external returns (...)
  // QuoteExactInputSingleParams = { PoolKey poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData }
  // Since hookData is dynamic, the struct is dynamic, so we pass offset 0x20 first
  
  // Encode the struct:
  // poolKey.currency0 = c0 (32 bytes)
  // poolKey.currency1 = c1 (32 bytes)
  // poolKey.fee = fee (32 bytes)
  // poolKey.tickSpacing = ts (32 bytes, int24 but padded to 32)
  // poolKey.hooks = hooks (32 bytes)
  // zeroForOne = zfi (32 bytes)
  // exactAmount = TEST_WEI (32 bytes)
  // hookData offset = offset to hookData within struct = 7*32 + 32 = 256 = 0x100
  // (7 static fields before hookData: 5 from poolKey + zfi + exactAmount = 7 fields = 224 bytes offset)
  // hookData.length = 0
  
  const sel = '0xa4748667'; // keccak256("quoteExactInputSingle((address,address,uint24,int24,address),bool,uint128,bytes)")... need to verify
  
  // Let me use the known selector from Uniswap V4 Quoter source
  // StateLibrary + IQuoter interface
  // Actually the selector might be different — let's try both common ones
  
  const zfi = zeroForOne ? 1n : 0n;
  const ts = BigInt(tickSpacing);
  const feeN = BigInt(fee);
  
  // Static fields offset: since outer params is dynamic (contains bytes), encode with offset
  // ABI: encode(params) where params is dynamic = offset_to_struct + struct_data
  // offset_to_struct = 0x20 (32)
  // struct_data:
  //   c0 (32), c1 (32), fee (32), ts (32), hooks (32) = 5 fields (poolKey static)
  //   zfi (32), exactAmount (32) = 2 fields
  //   hookData_offset within struct = (5+2)*32 = 224 = 0xe0
  //   hookData_length = 0
  
  const structOffset = '0000000000000000000000000000000000000000000000000000000000000020';
  const hookDataOffset = hex(7 * 32, 32); // offset within struct = 7 fields * 32 = 224
  
  const encoded =
    structOffset +
    padAddr(c0) +
    padAddr(c1) +
    hex(Number(feeN), 32) +
    hex(Number(ts), 32) +
    padAddr(hooks) +
    hex(Number(zfi), 32) +
    hex(Number(TEST_WEI), 32) +
    hookDataOffset +          // offset to hookData within struct
    hex(0, 32);               // hookData.length = 0
  
  // Try multiple selectors for V4 Quoter quoteExactInputSingle
  for (const sel of ['0xa4748667', '0xf7729d43', '0xbd21704a']) {
    try {
      const result = await ethCall(V4_QUOTER, sel + encoded);
      if (result && result !== '0x') {
        // Returns: int128[] deltaAmounts, uint160 sqrtPriceX96After, uint32 initializedTicksLoaded
        // First value is offset to deltaAmounts array
        return { sel, result: result.slice(0, 200) };
      }
    } catch(e) { /* try next */ }
  }
  throw new Error("all selectors failed");
}

console.log("=== OTR Pool Probe on Robinhood Chain ===\n");

// V3 tests
for (const fee of [100, 500, 3000, 10000]) {
  try {
    const out = await quoteV3(WETH9, OTR, fee);
    console.log(`V3 WETH→OTR fee=${fee}: ✓ amountOut=${out}`);
  } catch(e) { console.log(`V3 WETH→OTR fee=${fee}: ✗ ${e.message.slice(0,80)}`); }
}

// V4 tests
const v4combos = [
  { fee: 3000, ts: 60 }, { fee: 10000, ts: 200 }, { fee: 500, ts: 10 }, { fee: 100, ts: 1 },
  { fee: 3000, ts: 50 }, { fee: 10000, ts: 100 }, { fee: 0, ts: 1 }, { fee: 0, ts: 60 },
];
for (const { fee, ts } of v4combos) {
  try {
    const r = await quoteV4(fee, ts, true);
    console.log(`V4 fee=${fee} ts=${ts}: ✓ sel=${r.sel} raw=${r.result}`);
  } catch(e) { console.log(`V4 fee=${fee} ts=${ts}: ✗ ${e.message.slice(0,80)}`); }
}

// V2 test — getAmountsOut(uint256,address[])
// selector: 0xd06ca61f
try {
  // getAmountsOut(uint256 amountIn, address[] path)
  // encode: amountIn (32), offset to path (32 = 0x40), path.length (32 = 2), addr0 (32), addr1 (32)
  const data = '0xd06ca61f' +
    hex(Number(TEST_WEI), 32) +  // amountIn
    '0000000000000000000000000000000000000000000000000000000000000040' + // offset to path array
    '0000000000000000000000000000000000000000000000000000000000000002' + // path.length = 2
    padAddr(WETH9) +
    padAddr(OTR);
  const result = await ethCall(V2_ROUTER, data);
  // result: offset(32) + length(32) + [amount0(32), amount1(32)]
  if (result && result.length >= 194) {
    const amt1 = BigInt('0x' + result.slice(130, 194));
    console.log(`V2 WETH→OTR: ✓ amountOut=${amt1}`);
  } else {
    console.log(`V2: result too short: ${result}`);
  }
} catch(e) { console.log(`V2: ✗ ${e.message.slice(0,100)}`); }
