# 🤖 AI Kundtjänst

> Intelligent customer support system with AI-powered chat, ticket management, and real-time collaboration.

![Version](https://img.shields.io/badge/version-3.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

---

## ✨ Features

- 🤖 **AI-Powered Chat** - GPT-4 integration for intelligent customer support
- 🎫 **Ticket Management** - Full CRUD operations for support tickets
- 💬 **Real-time Communication** - Socket.io for live updates
- 🔐 **2FA Authentication** - Two-factor authentication with backup codes
- 📊 **Sentiment Analysis** - Automatic escalation of negative feedback
- 🎨 **Dark/Light Theme** - Beautiful, responsive UI with theme switching
- 📱 **Responsive Design** - Works perfectly on all devices
- 🔍 **Knowledge Base Search** - Elasticsearch-powered search (optional)
- 💳 **Stripe Integration** - Subscription management (optional)
- 📧 **Email Notifications** - Automated customer notifications
- 🧭 **SLA Dashboard UX** - Laddar‑indikator med spinner, Avbryt‑knapp och progressbar under datainhämtning

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and add your keys:
```env
OPENAI_API_KEY=your_openai_api_key
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
PORT=3000
```

### 3. Start the Server
```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

### 4. Open in Browser
```
http://localhost:3000
```

---

## 📋 Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **MongoDB** - Database
- **Socket.io** - Real-time communication
- **OpenAI** - AI chat completion
- **JWT** - Authentication
- **Bcrypt** - Password hashing
- **Speakeasy** - 2FA implementation

### Frontend
- **Vanilla JavaScript** - No frameworks needed!
- **CSS3** - Modern styling with variables
- **Chart.js** - Data visualization
- **Font Awesome** - Icons

### Optional Services
- **Redis** - Caching & job queue
- **Elasticsearch** - Knowledge base search
- **Stripe** - Payment processing
- **Sentry** - Error tracking
- **BullMQ** - Background jobs

---

## 📁 Project Structure

```
ai-kundtjanst/
├── server.js           # Main server file
├── script.js           # Frontend JavaScript
├── index.html          # Main HTML file
├── style.css           # Styling
├── package.json        # Dependencies
├── .env                # Environment variables
├── README.md           # This file
└── FIXES.md            # Changelog & fixes
```

---

## 🔐 Authentication

### Register
```javascript
POST /auth/register
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "companyId": "demo"
}
```

### Login
```javascript
POST /auth/login
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

### Get Current User
```javascript
GET /auth/me
Headers: { Authorization: "Bearer YOUR_JWT_TOKEN" }
```

---

## 💬 AI Chat

Send a message to the AI assistant:
```javascript
POST /chat
Headers: { Authorization: "Bearer YOUR_JWT_TOKEN" }
{
  "message": "How do I reset my password?"
}
```

Response includes:
- AI-generated reply
- Sentiment analysis
- Auto-escalation for negative sentiment

---

## 🎨 Customization

### Change Theme Colors
Edit `style.css` `:root` section:
```css
:root {
  --accent: #667eea;  /* Change primary color */
  --success: #48bb78; /* Change success color */
  /* ... more colors */
}
```

### Configure AI Model
Edit `server.js`:
```javascript
const aiResponse = await openai.chat.completions.create({
  model: "gpt-4", // Change to gpt-3.5-turbo for faster/cheaper
  // ...
});
```

---

## 🛠️ Development

### Run Tests
```bash
npm test
```

### Development Mode
```bash
npm run dev  # Uses nodemon for auto-reload
```

### Environment Variables
```env
# Required
OPENAI_API_KEY=sk-...
MONGO_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
PORT=3000

# Optional
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200
STRIPE_SECRET_KEY=sk_test_...
SENTRY_DSN=https://...
SMTP_HOST=smtp.gmail.com
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
```

---

## 📝 API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/register` | Register new user | ❌ |
| POST | `/auth/login` | Login user | ❌ |
| GET | `/auth/me` | Get current user | ✅ |
| POST | `/auth/2fa/setup` | Setup 2FA | ✅ |
| POST | `/auth/2fa/verify` | Verify 2FA token | ✅ |
| POST | `/chat` | Send AI chat message | ✅ |
| GET | `/kb/search` | Search knowledge base | ✅ |
| GET | `/gdpr/export` | Export user data | ✅ |
| DELETE | `/gdpr/delete` | Delete user data | ✅ |
| GET | `/billing/history` | Get billing history | ✅ |

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 👨‍💻 Author

**Your Name**
- GitHub: [@yourusername](https://github.com/yourusername)

---

## 🙏 Acknowledgments

- OpenAI for GPT-4 API
- MongoDB for database
- Socket.io for real-time features
- All open-source contributors

---

## 📞 Support

Need help? 
- 📧 Email: support@ai-kundtjanst.se
- 💬 Discord: [Join our server](#)
- 📖 Docs: [Read the docs](#)

---

Made with ❤️ and ☕
