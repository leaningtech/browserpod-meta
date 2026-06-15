const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// In-memory data store
const store = {
  surveys: {},
  nextId: 1
};

// Initialize with survey from parent if provided
function initializeSurvey(surveyData) {
  if (surveyData) {
    // Use surveyId from data if provided, otherwise generate one
    const surveyId = surveyData.surveyId || `survey_${store.nextId++}`;
    const survey = {
      id: surveyId,
      title: surveyData.title,
      description: surveyData.description || '',
      questions: surveyData.questions.map((q, idx) => ({
        ...q,
        id: q.id || `q_${idx}`
      })),
      responses: [],
      createdAt: new Date().toISOString(),
      adminToken: surveyData.adminToken || Math.random().toString(36).substring(2, 15)
    };
    
    store.surveys[surveyId] = survey;
    
    // Set global for access in routes
    app.locals.currentSurveyId = surveyId;
    app.locals.currentSurveyAdminToken = survey.adminToken;
    
    console.log(`Survey initialized: ${surveyId}`);
    
    return surveyId;
  }
  return null;
}

// Try to initialize from parent window
// In browser environment, window.surveyData is set by the parent Vite app
if (typeof window !== 'undefined' && window.surveyData) {
  initializeSurvey(window.surveyData);
}

// Try to read from survey-data.js file (for BrowserPod environment)
try {
  const surveyDataModule = require('./survey-data.js');
  if (surveyDataModule && surveyDataModule.surveyId) {
    const initialized = initializeSurvey(surveyDataModule);
    console.log('Survey initialized:', surveyDataModule.surveyId);
  }
} catch (e) {
  console.log('Survey data file not available yet or error:', e.message);
}

// ===== UTILITY FUNCTIONS =====

// Generate unique IDs
function generateId() {
  return `survey_${store.nextId++}`;
}

// Generate QR code as data URL
async function generateQRCode(url) {
  try {
    return await QRCode.toDataURL(url);
  } catch (error) {
    console.error('QR Code generation failed:', error);
    return null;
  }
}

// Validate survey response based on survey config
function validateResponse(survey, response) {
  const errors = [];
  
  for (const question of survey.questions) {
    const answer = response[question.id];
    
    if (question.required && !answer) {
      errors.push(`Question "${question.text}" is required`);
      continue;
    }
    
    switch (question.type) {
      case 'text':
        if (answer && typeof answer !== 'string') {
          errors.push(`Question "${question.text}" must be text`);
        }
        if (answer && answer.length > 5000) {
          errors.push(`Question "${question.text}" response too long (max 5000 chars)`);
        }
        break;
      
      case 'multiple-choice':
      case 'single-choice':
        if (answer) {
          const validOptions = question.options.map(opt => opt.id);
          if (Array.isArray(answer)) {
            if (!answer.every(a => validOptions.includes(a))) {
              errors.push(`Invalid option selected for "${question.text}"`);
            }
          } else if (!validOptions.includes(answer)) {
            errors.push(`Invalid option selected for "${question.text}"`);
          }
        }
        break;
      
      case 'scale':
        if (answer) {
          const num = parseInt(answer);
          if (isNaN(num) || num < question.minValue || num > question.maxValue) {
            errors.push(`Scale answer for "${question.text}" must be between ${question.minValue} and ${question.maxValue}`);
          }
        }
        break;
    }
  }
  
  return errors;
}

// ===== API ROUTES =====

// Create a new survey
app.post('/api/surveys', (req, res) => {
  try {
    // If a survey already exists (pre-populated from parent), reject new creation
    if (app.locals.currentSurveyId) {
      return res.status(409).json({ 
        error: 'A survey is already active in this environment',
        surveyId: app.locals.currentSurveyId
      });
    }
    
    const { title, description, questions } = req.body;
    
    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Invalid survey data' });
    }
    
    const surveyId = generateId();
    const survey = {
      id: surveyId,
      title,
      description: description || '',
      questions: questions.map((q, idx) => ({
        ...q,
        id: q.id || `q_${idx}`
      })),
      responses: [],
      createdAt: new Date().toISOString(),
      adminToken: Math.random().toString(36).substring(2, 15)
    };
    
    store.surveys[surveyId] = survey;
    app.locals.currentSurveyId = surveyId;
    app.locals.currentSurveyAdminToken = survey.adminToken;
    
    res.json({
      id: surveyId,
      adminToken: survey.adminToken,
      clientUrl: `${req.protocol}://${req.get('host')}/survey/${surveyId}`,
      adminUrl: `${req.protocol}://${req.get('host')}/admin/${surveyId}?token=${survey.adminToken}`
    });
  } catch (error) {
    console.error('Survey creation error:', error);
    res.status(500).json({ error: 'Failed to create survey' });
  }
});

// Update existing survey (admin only)
app.put('/api/surveys/:surveyId', (req, res) => {
  try {
    const survey = store.surveys[req.params.surveyId];
    
    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }
    
    // Validate admin token
    if (req.query.token !== survey.adminToken) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const { title, description, questions } = req.body;
    
    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Invalid survey data' });
    }
    
    // Update survey while preserving responses and metadata
    survey.title = title;
    survey.description = description || '';
    survey.questions = questions.map((q, idx) => ({
      ...q,
      id: q.id || `q_${idx}`
    }));
    survey.updatedAt = new Date().toISOString();
    
    res.json({ 
      success: true,
      message: 'Survey updated successfully',
      survey: {
        id: survey.id,
        title: survey.title,
        description: survey.description,
        questions: survey.questions
      }
    });
  } catch (error) {
    console.error('Survey update error:', error);
    res.status(500).json({ error: 'Failed to update survey' });
  }
});

// Get survey details (client view)
app.get('/api/surveys/:surveyId', (req, res) => {
  try {
    const survey = store.surveys[req.params.surveyId];
    
    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }
    
    // Return survey without responses
    const { responses, adminToken, ...surveyData } = survey;
    res.json(surveyData);
  } catch (error) {
    console.error('Fetch survey error:', error);
    res.status(500).json({ error: 'Failed to fetch survey' });
  }
});

// Get survey with admin token (admin view)
app.get('/api/surveys/:surveyId/admin', (req, res) => {
  try {
    const survey = store.surveys[req.params.surveyId];
    
    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }
    
    if (req.query.token !== survey.adminToken) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    res.json(survey);
  } catch (error) {
    console.error('Admin fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch survey' });
  }
});

// Submit a response
app.post('/api/surveys/:surveyId/responses', (req, res) => {
  try {
    const survey = store.surveys[req.params.surveyId];
    
    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }
    
    const errors = validateResponse(survey, req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    
    const response = {
      id: `response_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      data: req.body,
      submittedAt: new Date().toISOString()
    };
    
    survey.responses.push(response);
    
    res.json({ success: true, responseId: response.id });
  } catch (error) {
    console.error('Response submission error:', error);
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

// Get aggregated results
app.get('/api/surveys/:surveyId/results', (req, res) => {
  try {
    const survey = store.surveys[req.params.surveyId];
    
    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }
    
    if (req.query.token && req.query.token !== survey.adminToken) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const results = {
      surveyId: survey.id,
      title: survey.title,
      totalResponses: survey.responses.length,
      questions: survey.questions.map(question => {
        const questionResults = {
          id: question.id,
          text: question.text,
          type: question.type
        };
        
        switch (question.type) {
          case 'text':
            questionResults.responses = survey.responses
              .map(r => r.data[question.id])
              .filter(Boolean);
            break;
          
          case 'single-choice':
          case 'multiple-choice':
            const optionCounts = {};
            question.options.forEach(opt => {
              optionCounts[opt.id] = { label: opt.label, count: 0 };
            });
            
            survey.responses.forEach(r => {
              const answer = r.data[question.id];
              if (answer) {
                if (Array.isArray(answer)) {
                  answer.forEach(a => {
                    if (optionCounts[a]) optionCounts[a].count++;
                  });
                } else if (optionCounts[answer]) {
                  optionCounts[answer].count++;
                }
              }
            });
            
            questionResults.options = Object.entries(optionCounts).map(([id, data]) => ({
              id,
              ...data
            }));
            break;
          
          case 'scale':
            const scaleValues = survey.responses
              .map(r => parseInt(r.data[question.id]))
              .filter(v => !isNaN(v));
            
            questionResults.values = scaleValues;
            questionResults.average = scaleValues.length > 0
              ? (scaleValues.reduce((a, b) => a + b, 0) / scaleValues.length).toFixed(2)
              : null;
            break;
        }
        
        return questionResults;
      })
    };
    
    res.json(results);
  } catch (error) {
    console.error('Results fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// Export results as CSV
app.get('/api/surveys/:surveyId/export/csv', (req, res) => {
  try {
    const survey = store.surveys[req.params.surveyId];
    
    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }
    
    if (req.query.token !== survey.adminToken) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Build CSV
    let csv = '"Response ID","Submitted At"';
    survey.questions.forEach(q => {
      csv += `,"${q.text.replace(/"/g, '""')}"`;
    });
    csv += '\n';
    
    survey.responses.forEach(response => {
      csv += `"${response.id}","${response.submittedAt}"`;
      survey.questions.forEach(q => {
        let value = response.data[q.id] || '';
        if (Array.isArray(value)) {
          value = value.join('; ');
        }
        csv += `,"${String(value).replace(/"/g, '""')}"`;
      });
      csv += '\n';
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${survey.id}_results.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// Generate QR code for survey
app.get('/api/surveys/:surveyId/qrcode', async (req, res) => {
  try {
    const survey = store.surveys[req.params.surveyId];
    
    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }
    
    const clientUrl = `${req.protocol}://${req.get('host')}/survey/${req.params.surveyId}`;
    const qrDataUrl = await generateQRCode(clientUrl);
    
    res.json({ qrCode: qrDataUrl });
  } catch (error) {
    console.error('QR code generation error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', surveys: Object.keys(store.surveys).length });
});

// ===== STATIC HTML PAGES =====

// Home page - redirect to survey
app.get('/', (req, res) => {
  const surveyId = app.locals.currentSurveyId;
  
  if (surveyId) {
    // If survey exists, redirect to admin
    const adminUrl = `${req.protocol}://${req.get('host')}/admin/${surveyId}?token=${app.locals.currentSurveyAdminToken}`;
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Survey Started</title>
        <style>
          body { font-family: system-ui; padding: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
          .container { max-width: 600px; margin: 0 auto; text-align: center; }
          h1 { font-size: 2.5rem; margin-bottom: 20px; }
          p { font-size: 1.1rem; margin-bottom: 20px; }
          a { display: inline-block; background: white; color: #667eea; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎯 Survey Ready!</h1>
          <p>Your survey is being served. Choose a view:</p>
          <p>
            <a href="/survey/${surveyId}" target="_blank">👥 Client Survey</a>
            &nbsp;&nbsp;
            <a href="/admin/${surveyId}?token=${app.locals.currentSurveyAdminToken}" target="_blank">📊 Admin Dashboard</a>
          </p>
        </div>
      </body>
      </html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Survey Server</title>
        <style>
          body { font-family: system-ui; padding: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
          .container { max-width: 600px; margin: 0 auto; text-align: center; }
          h1 { font-size: 2.5rem; margin-bottom: 20px; }
          p { font-size: 1.1rem; color: rgba(255,255,255,0.9); }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎯 SaySomething</h1>
          <p>Survey environment initialized. Waiting for survey creation...</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Survey client page
app.get('/survey/:surveyId', (req, res) => {
  const surveyId = req.params.surveyId;
  const currentSurveyId = app.locals.currentSurveyId;
  
  // Only allow access to the current active survey
  if (surveyId !== currentSurveyId) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Access Denied</title>
        <style>
          body { font-family: system-ui; padding: 40px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          h1 { color: #d32f2f; margin-bottom: 10px; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Access Denied</h1>
          <p>This survey is not currently active. Contact the survey administrator for the active survey link.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  res.sendFile(path.join(__dirname, 'public', 'survey.html'));
});

// Admin page
app.get('/admin/:surveyId', (req, res) => {
  const surveyId = req.params.surveyId;
  const currentSurveyId = app.locals.currentSurveyId;
  
  // Only allow access to the current active survey
  if (surveyId !== currentSurveyId) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Access Denied</title>
        <style>
          body { font-family: system-ui; padding: 40px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          h1 { color: #d32f2f; margin-bottom: 10px; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Access Denied</h1>
          <p>This survey is not currently active. Contact the survey administrator for the active survey link.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Results view page
app.get('/results/:surveyId', (req, res) => {
  const surveyId = req.params.surveyId;
  const currentSurveyId = app.locals.currentSurveyId;
  
  // Only allow access to the current active survey
  if (surveyId !== currentSurveyId) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Access Denied</title>
        <style>
          body { font-family: system-ui; padding: 40px; background: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          h1 { color: #d32f2f; margin-bottom: 10px; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Access Denied</h1>
          <p>This survey is not currently active. Contact the survey administrator for the active survey link.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  res.sendFile(path.join(__dirname, 'public', 'results.html'));
});

app.listen(port, () => {
  console.log(`SaySomething survey app listening on port ${port}`);
  console.log(`Visit http://localhost:${port} to start creating surveys`);
});
