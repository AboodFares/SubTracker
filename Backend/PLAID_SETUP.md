# Plaid Setup Guide

## Do You Need Plaid?

**Yes, you need a Plaid account** to use the bank connection feature. Plaid is the service that securely connects to banks and retrieves transaction data.

---

## Step 1: Create Plaid Account

1. **Go to Plaid Dashboard:**
   - Visit: https://dashboard.plaid.com/signup
   - Sign up for a free account

2. **Choose Account Type:**
   - **Sandbox** (Free) - For testing and development
   - **Development** (Free) - For development with real bank connections
   - **Production** (Paid) - For live applications

**For testing/development, use Sandbox (it's free!)**

---

## Step 2: Get Your API Credentials

After signing up:

1. **Log in to Plaid Dashboard:** https://dashboard.plaid.com/

2. **Navigate to Team Settings → Keys:**
   - You'll see your credentials:
     - **Client ID** (starts with something like `5f...`)
     - **Secret Key** (starts with something like `secret-sandbox-...` or `secret-development-...`)

3. **Copy these values** - you'll need them for your `.env` file

---

## Step 3: Add Credentials to Your .env File

Open your `Backend/.env` file and add:

```env
# Plaid Configuration
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET_KEY=your_secret_key_here
PLAID_ENV=sandbox
```

**Important Notes:**
- `PLAID_ENV` can be:
  - `sandbox` - For testing (free, uses fake bank data)
  - `development` - For development (free, uses real banks)
  - `production` - For live apps (paid, requires approval)

**For testing, use `sandbox`**

---

## Step 4: Optional - Encryption Key

The code encrypts bank access tokens before storing them. You can generate a secure encryption key:

```bash
# Generate a random 32-byte key (64 hex characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.env`:
```env
ENCRYPTION_KEY=your_generated_key_here_64_characters_long
```

**Note:** If you don't set this, the code uses a default key (not secure for production!)

---

## Step 5: Optional - Backend URL for Webhooks

If you want to receive webhooks from Plaid (for transaction updates), add:

```env
BACKEND_URL=http://localhost:3000
```

Or your production URL when deployed.

---

## Complete .env Example

```env
# MongoDB
MONGODB_URI=mongodb+srv://...

# JWT
JWT_SECRET=your-secret-key

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# OpenAI
OPENAI_API_KEY=sk-...

# Plaid
PLAID_CLIENT_ID=5f1234567890abcdef
PLAID_SECRET_KEY=secret-sandbox-1234567890abcdef1234567890abcdef
PLAID_ENV=sandbox

# Optional
ENCRYPTION_KEY=your_64_character_hex_key_here
BACKEND_URL=http://localhost:3000

# Server
PORT=3000
NODE_ENV=development
```

---

## Testing with Sandbox

**Sandbox Mode** (free, for testing):
- Uses fake/test bank accounts
- No real bank connections needed
- Perfect for development

**Test Credentials:**
When using Sandbox, Plaid provides test credentials you can use:
- Username: `user_good`
- Password: `pass_good`
- Or use any test credentials from Plaid's documentation

---

## How It Works

1. **User clicks "Connect Bank"** in your app
2. **Your backend calls Plaid** → Gets a `link_token`
3. **Plaid Link opens** → User selects their bank and logs in
4. **Plaid returns** → `public_token`
5. **Your backend exchanges** → `public_token` for `access_token`
6. **Access token stored** → Encrypted in your database
7. **You can now** → Fetch transactions using the access token

---

## Important Security Notes

1. **Never commit `.env` file** to Git
2. **Encrypt access tokens** before storing (code does this automatically)
3. **Use HTTPS** in production
4. **Rotate keys** if compromised

---

## Troubleshooting

### Error: "Plaid is not configured"
- Check that `PLAID_CLIENT_ID` and `PLAID_SECRET_KEY` are set in `.env`
- Make sure there are no typos
- Restart your server after adding credentials

### Error: "Invalid credentials"
- Double-check your Client ID and Secret Key
- Make sure `PLAID_ENV` matches your account type (sandbox/development/production)
- Verify you copied the full secret key (they're long!)

### Error: "Link token creation failed"
- Check your Plaid dashboard for any account issues
- Verify your account is active
- Make sure you're using the correct environment

---

## Cost Information

- **Sandbox:** Free (for testing)
- **Development:** Free (for development)
- **Production:** 
  - Pay-as-you-go pricing
  - Check Plaid's pricing page for current rates
  - Usually based on API calls

**For development/testing, you can use Sandbox for free!**

---

## Next Steps

1. ✅ Create Plaid account
2. ✅ Get your credentials
3. ✅ Add to `.env` file
4. ✅ Restart your backend server
5. ✅ Test bank connection in your app

---

## Resources

- **Plaid Dashboard:** https://dashboard.plaid.com/
- **Plaid Docs:** https://plaid.com/docs/
- **Plaid API Reference:** https://plaid.com/docs/api/
- **Sandbox Testing:** https://plaid.com/docs/sandbox/

---

## Quick Start Checklist

- [ ] Created Plaid account
- [ ] Got Client ID and Secret Key
- [ ] Added credentials to `Backend/.env`
- [ ] Set `PLAID_ENV=sandbox` (for testing)
- [ ] (Optional) Generated encryption key
- [ ] Restarted backend server
- [ ] Tested bank connection in app

Once you've added the credentials, your bank connection feature will work! 🎉

