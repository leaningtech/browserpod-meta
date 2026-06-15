# SaySomething - Real-time Survey Application

A modern, ephemeral survey platform built with BrowserPod that runs entirely in the browser without server-side data storage.

## 🎯 Features

- **Survey Creation**: Easy-to-use interface to create surveys with multiple question types:
  - Free text responses
  - Single choice questions
  - Multiple choice questions
  - Scale/rating questions
  
- **Real-time Response Collection**: Collect responses from users directly in the browser

- **Live Results Dashboard**: View aggregated results in real-time as responses come in

- **QR Code Generation**: Automatically generates QR codes for easy survey sharing

- **CSV Export**: Download all responses as a CSV file for further analysis

- **Role-based Access**:
  - **Client Users**: Can access and complete surveys via shareable links
  - **Admin Users**: Can view results, access QR codes, and export data with a secure admin token

- **Ephemeral Data**: All data is stored in-memory within the WASM Node.js runtime—no cloud storage

## 🏗️ Architecture

### Technology Stack
- **Backend**: Express.js (running in BrowserPod's WASM Node.js environment)
- **Frontend**: Vanilla JavaScript with modern CSS (no build-time framework dependency)
- **QR Code Generation**: qrcode library
- **Data Storage**: In-memory JSON (ephemeral)

### Project Structure
```
server-test/
├── src/
│   ├── main.js           # Orchestration script for BrowserPod
│   ├── utils.js          # File copying utilities
│   └── style.css
├── public/project/
│   ├── main.js           # Express.js server with API routes
│   ├── package.json      # Dependencies
│   └── public/
│       ├── app.html      # Survey creation interface
│       ├── survey.html   # Client response form
│       ├── admin.html    # Admin dashboard
│       └── results.html  # Shareable results view
├── index.html            # Main portal page
├── vite.config.js        # Vite configuration
├── package.json
└── .env                  # API key for BrowserPod
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (for local development)
- BrowserPod API key from [console.browserpod.io](https://console.browserpod.io)

### Installation

1. **Clone/Setup the project**:
   ```bash
   cd server-test
   npm install
   ```

2. **Configure BrowserPod API Key**:
   The `.env` file should contain:
   ```
   VITE_BP_APIKEY=your_api_key_here
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open in browser**:
   Visit `http://localhost:5173` (or the URL shown in terminal)

## 📖 Usage

### Creating a Survey

1. Open the home page and click "Create a Survey"
2. Enter survey title and description
3. Add questions by:
   - Writing the question text
   - Selecting the question type
   - For choice questions, add options
   - For scale questions, set min/max values
   - Mark as required if needed
4. Click "Create Survey"
5. You'll receive:
   - **Client URL**: Share this with respondents
   - **Admin URL**: Access dashboard with your responses
   - **QR Code**: Automatically generated for easy mobile access

### Viewing Responses

**As Admin**:
- Access the Admin URL with your secure token
- View real-time aggregated results
- Download responses as CSV
- Share the results view with stakeholders

**As Respondent**:
- Open the Client URL or scan QR code
- Answer all required questions
- Submit to add your response to the live results

**Shareable Results**:
- Share results view publicly (no token required by default)
- Results auto-refresh every 5 seconds
- See live statistics and response visualizations

## 📊 API Routes

### Survey Management

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/surveys` | Create a new survey |
| GET | `/api/surveys/:id` | Get survey (client view) |
| GET | `/api/surveys/:id/admin` | Get survey with responses (requires token) |

### Response Collection

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/surveys/:id/responses` | Submit a response |
| GET | `/api/surveys/:id/results` | Get aggregated results |

### Exports & Utilities

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/surveys/:id/export/csv` | Export responses as CSV |
| GET | `/api/surveys/:id/qrcode` | Generate QR code |
| GET | `/api/health` | Health check endpoint |

## 🔒 Security

- **Admin Token**: Unique token generated per survey for admin access
- **No Cloud Storage**: Data never leaves the browser environment
- **Ephemeral**: Data is cleared when the browser pod is closed
- **CORS Headers**: Proper cross-origin headers configured

## 🎨 Question Types

### Text
Free-form text responses with max 5000 character limit.

### Single Choice
Respondent selects exactly one option from a list.

### Multiple Choice
Respondent can select zero, one, or multiple options.

### Scale
Respondent rates on a numeric scale (e.g., 1-5, 1-10).

## 📦 Dependencies

### Backend Dependencies
- `express`: Web framework
- `body-parser`: Request parsing
- `qrcode`: QR code generation
- `papaparse`: CSV parsing (for future features)
- `pdfkit`: PDF generation (for future features)

### Development Dependencies
- `vite`: Build tool
- `@leaningtech/browserpod`: BrowserPod client library

## 🐛 Known Issues & Limitations

See [ISSUES.md](ISSUES.md) for detailed information about known issues and limitations.

## 📝 Data Storage Notes

All data is stored in-memory within the Node.js environment running in BrowserPod:

```javascript
const store = {
  surveys: {},      // Survey configurations and responses
  nextId: 1         // ID counter
};
```

**Important**: 
- Data persists only while the browser pod instance is active
- Refreshing or closing the browser pod will clear all data
- No persistent backend or database is used
- Each new instance starts with an empty store

## 🔄 How BrowserPod Works

1. **Initialization**: The browser boots a BrowserPod instance with your API key
2. **File Transfer**: Frontend files are copied to the pod's filesystem
3. **Dependency Installation**: npm install runs inside the pod
4. **Server Execution**: Express server starts in the pod
5. **Portal Creation**: BrowserPod creates a URL to access the running server
6. **Communication**: All requests are proxied through the portal

## 🚦 Development

### Building the project
```bash
npm run build
```

### Preview production build
```bash
npm run preview
```

### Project conventions
- All frontend code uses vanilla JavaScript (no build-time dependencies)
- CSS is inline or in separate stylesheets
- HTML is self-contained with embedded scripts
- Backend validation for all user inputs
- Responsive design for mobile-first experience

## 📄 License

MIT

## 🤝 Support

For BrowserPod specific issues, visit [BrowserPod Documentation](https://docs.browserpod.io)

For questions about this survey application, refer to the issues log and architecture documentation.
