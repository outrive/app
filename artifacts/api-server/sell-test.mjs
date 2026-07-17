import { createWalletClient, createPublicClient, http, defineChain, formatUnits, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RH = defineChain({ id:4663, name:'Robinhood Chain', nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18}, rpcUrls:{default:{http:['https://rpc.mainnet.chain.robinhood.com']}} });
const RPC='https://rpc.mainnet.chain.robinhood.com';
const FLAP='0xc94135b63772b91d79d0a2daab2a8801f32359bd';
const NVDA_T='0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec';
const NVDA_P='0x682fd352329026885366d6649d61cb4ee505e7a4';
const _WETH='0bd7d308f8e1639fab988df18a8011f41eacad73';
const _USDG='5fc5360d0400a0fd4f2af552add042d716f1d168';
const _V3  ='52e65b17fb6e5ba00ed806f37afcd2daa50271ca';
const _ETH ='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const _FLAP='c94135b63772b91d79d0a2daab2a8801f32359bd';
const SEL='0x77963966';
const WETH_FROM='0x0bd7d308f8e1639fab988df18a8011f41eacad73';
const OVR_BAL='0x6d94746bfae4bd07d20f78e449e45ee605807f5f3ded1e22683dec972daba9ab';
const OVR_ALW='0x2dca2eb46b66a676451d33725479d05b6fceca5480681e2e0e31a32c161e4e42';

const ha=s=>'000000000000000000000000'+s.replace(/^0x/i,'').toLowerCase().padStart(40,'0');
const hu=n=>BigInt(n).toString(16).padStart(64,'0');
const HZ='0'.repeat(64);

function buildBuy(stock,pool,ethWei,minOut,recip,dl){
  const cb='2203d44a'+hu(0)+hu(0)+hu(minOut)+ha(_FLAP)+hu(dl)+'0'.repeat(56);
  const head=ha(_ETH)+ha(stock)+hu(ethWei)+hu(minOut)+ha(recip)+hu(dl)+HZ+HZ+HZ+HZ+HZ+hu(0x180);
  const rh=hu(2)+hu(0x40)+hu(0x1a0);
  const r0=hu(2)+ha(_V3)+ha(_WETH)+ha(_USDG)+hu(ethWei)+HZ+HZ+hu(0x120)+HZ+hu(32)+hu(100);
  const r1=HZ+ha(pool)+ha(_USDG)+ha(stock)+HZ+HZ+hu(minOut)+hu(0x120)+hu(36)+hu(164)+cb;
  return SEL+head+rh+r0+r1;
}
function buildSell(stock,pool,amtWei,minEth,recip,dl){
  const cb='2203d44a'+hu(1)+hu(amtWei)+hu(1)+ha(_FLAP)+hu(dl)+'0'.repeat(56);
  const head=ha(stock)+ha(_ETH)+hu(amtWei)+hu(minEth)+ha(recip)+hu(dl)+HZ+HZ+HZ+HZ+HZ+hu(0x180);
  const rh=hu(3)+hu(0x60)+hu(0x260)+hu(0x3c0);
  const r0=HZ+ha(pool)+ha(stock)+ha(_USDG)+hu(amtWei)+HZ+hu(1)+hu(0x120)+hu(36)+hu(164)+cb;
  const r1=hu(2)+ha(_V3)+ha(_USDG)+ha(_WETH)+HZ+HZ+hu(minEth)+hu(0x120)+HZ+hu(32)+hu(100);
  const r2=hu(4)+ha(_WETH)+ha(_WETH)+ha(_ETH)+HZ+HZ+hu(1)+hu(0x120)+HZ+hu(0);
  return SEL+head+rh+r0+r1+r2;
}

async function rpc(method,params){
  await new Promise(r=>setTimeout(r,300)); // rate-limit safety
  const r=await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(12000)});
  return r.json();
}

async function main(){
  const pk=process.env.DEPLOYER_PRIVATE_KEY;
  if(!pk){console.error('no DEPLOYER_PRIVATE_KEY');process.exit(1);}
  const acc=privateKeyToAccount(pk.startsWith('0x')?pk:`0x${pk}`);
  const wc=createWalletClient({account:acc,chain:RH,transport:http(RPC)});
  const pub=createPublicClient({chain:RH,transport:http(RPC)});
  const addr=acc.address;
  console.log('\n📍 Treasury:',addr);

  // Check NVDA balance
  const balR=await rpc('eth_call',[{to:NVDA_T,data:'0x70a08231'+ha(addr)},'latest']);
  const nvdaBal=balR.result&&balR.result!=='0x'?BigInt(balR.result):0n;
  console.log('🪙 NVDA:',formatUnits(nvdaBal,18));

  // Check ETH balance
  const ethR=await rpc('eth_getBalance',[addr,'latest']);
  const ethBal=ethR.result?BigInt(ethR.result):0n;
  console.log('💰 ETH:',formatUnits(ethBal,18));

  const dl=Math.floor(Date.now()/1000)+1800;

  // --- First: get BUY quote to understand current on-chain price ---
  console.log('\n🔍 Buy reference quote (0.001 ETH → NVDA)...');
  const REF=parseUnits('0.001',18);
  const buyData=buildBuy(NVDA_T,NVDA_P,REF,1n,addr,dl);
  const bqR=await rpc('eth_call',[{from:'0x0000000000000000000000000000000000000001',to:FLAP,data:buyData,value:'0x'+REF.toString(16)},'latest']);
  if(bqR.result&&bqR.result!=='0x'&&bqR.result.length>=66){
    const sharesOut=BigInt(bqR.result.slice(0,66));
    const ethUsd=1831; // approx
    const pricePerShare=(Number(REF)/Number(sharesOut))*ethUsd;
    console.log(`📊 0.001 ETH → ${formatUnits(sharesOut,18)} NVDA`);
    console.log(`💵 Implied NVDA price: $${pricePerShare.toFixed(2)}`);
  }else{
    console.warn('⚠️  Buy quote sim error:',JSON.stringify(bqR.error??bqR.result?.slice(0,80)));
  }

  if(nvdaBal===0n){
    console.error('\n❌ No NVDA to sell — treasury needs NVDA first');
    process.exit(1);
  }

  // Sell amount: 0.005 NVDA (small portion)
  const SELL=nvdaBal>=parseUnits('0.005',18)?parseUnits('0.005',18):nvdaBal;
  console.log('\n📤 Selling:',formatUnits(SELL,18),'NVDA');

  // Check allowance
  const alwR=await rpc('eth_call',[{to:NVDA_T,data:'0xdd62ed3e'+ha(addr)+ha(FLAP)},'latest']);
  const alw=alwR.result&&alwR.result!=='0x'?BigInt(alwR.result):0n;
  console.log('🔑 Allowance:',formatUnits(alw,18),'NVDA');

  // Approve if needed
  if(alw<SELL){
    console.log('⚙️  Approving FlapPortal...');
    try{
      const h=await wc.sendTransaction({to:NVDA_T,data:'0x095ea7b3'+ha(FLAP)+'f'.repeat(64),gas:80000n,chain:RH});
      console.log('  Approve TX:',h);
      const ar=await pub.waitForTransactionReceipt({hash:h,timeout:60000});
      if(ar.status!=='success'){console.error('❌ Approve reverted');process.exit(1);}
      console.log('✅ Approved block',ar.blockNumber);
    }catch(e){console.error('❌ Approve failed:',e.shortMessage??e.message);process.exit(1);}
  }else{
    console.log('✅ Already approved');
  }

  // Sell simulation with state override
  console.log('\n🔍 Sell simulation...');
  const sd=buildSell(NVDA_T,NVDA_P,SELL,1n,addr,dl);
  const ovr={[NVDA_T]:{stateDiff:{[OVR_BAL]:'0x'+hu(SELL),[OVR_ALW]:'0x'+'f'.repeat(64)}}};
  const sqR=await rpc('eth_call',[{from:WETH_FROM,to:FLAP,data:sd,value:'0x0'},'latest',ovr]);
  let simEth=0n;
  if(sqR.result&&sqR.result!=='0x'&&sqR.result.length>=66){
    simEth=BigInt(sqR.result.slice(0,66));
    console.log(`📊 Sim: sell ${formatUnits(SELL,18)} NVDA → ${formatUnits(simEth,18)} ETH`);
  }else{
    console.warn('⚠️  Sell sim error:',JSON.stringify(sqR.error??sqR.result?.slice(0,100)));
  }

  // Use 5% slippage for tolerance
  const minEth=simEth>0n?simEth*95n/100n:1n;
  console.log('🛡️  MinEth (5% slip):',formatUnits(minEth,18),'ETH');

  // Execute sell
  console.log('\n🚀 Sending sell TX...');
  const sellData=buildSell(NVDA_T,NVDA_P,SELL,minEth,addr,dl);
  try{
    const hash=await wc.sendTransaction({to:FLAP,value:0n,data:sellData,gas:700000n,chain:RH});
    console.log('✅ Hash:',hash);
    console.log('🔗',`https://robinhoodchain.blockscout.com/tx/${hash}`);
    const receipt=await pub.waitForTransactionReceipt({hash,timeout:120000});
    console.log(receipt.status==='success'
      ?`\n🎉 SELL CONFIRMED ✅  block ${receipt.blockNumber}  gas ${receipt.gasUsed.toLocaleString()}`
      :'\n💥 SELL REVERTED on-chain');
  }catch(e){
    console.error('\n❌ sendTransaction error:',e.shortMessage??e.message);
    if(e.cause?.data)console.error('   revert data:',e.cause.data);
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
