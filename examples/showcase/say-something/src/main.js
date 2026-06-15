import { BrowserPod } from '@leaningtech/browserpod'
import { copyFile } from './utils'
import QRCode from 'qrcode'

// Make QRCode available globally for admin.html
window.QRCode = QRCode;

let pod = null;
let surveyCreatorActive = true;

// Initialize with survey creator form
renderSurveyCreator();

async function renderSurveyCreator() {
  const appContainer = document.getElementById('app-container');
  
  // Load the survey creator HTML
  const response = await fetch('/project/public/app.html');
  const html = await response.text();
  
  // Extract the script section from the HTML
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  const appHtmlWithoutScript = html.replace(/<script>[\s\S]*?<\/script>/, '');
  
  appContainer.innerHTML = appHtmlWithoutScript;
  
  // Execute the script by injecting it into the DOM
  // This makes functions truly global and accessible to onclick handlers
  if (scriptMatch) {
    const scriptContent = scriptMatch[1];
    const scriptElement = document.createElement('script');
    scriptElement.textContent = scriptContent;
    document.body.appendChild(scriptElement);
    // Remove the script element after execution (optional cleanup)
    document.body.removeChild(scriptElement);
  }
  
  // Add event listener for form submission
  const form = appContainer.querySelector('#surveyForm');
  if (form) {
    // Prevent the form's original submit handler by cloning and replacing
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    
    // Add our custom submit handler
    newForm.addEventListener('submit', handleSurveyCreation);
  }
}

async function handleSurveyCreation(e) {
  e.preventDefault();
  
  // Get form data
  const form = e.target;
  const title = form.querySelector('#surveyTitle').value;
  const description = form.querySelector('#surveyDescription').value;
  const questions = [];
  
  form.querySelectorAll('.question-card').forEach(card => {
    const inputs = card.querySelectorAll('input[type="text"]');
    const select = card.querySelector('select');
    const checkbox = card.querySelector('input[type="checkbox"]');
    
    const questionText = inputs[0].value;
    const questionType = select.value;
    const required = checkbox.checked;
    
    const question = {
      text: questionText,
      type: questionType,
      required
    };
    
    if (questionType === 'single-choice' || questionType === 'multiple-choice') {
      const optionsContainer = card.querySelector('.options-list');
      if (optionsContainer) {
        question.options = Array.from(optionsContainer.querySelectorAll('input[type="text"]')).map((inp, idx) => ({
          id: `opt_${idx}`,
          label: inp.value
        }));
      }
    }
    
    if (questionType === 'scale') {
      const scaleInputs = card.querySelectorAll('.scale-inputs input[type="number"]');
      question.minValue = parseInt(scaleInputs[0].value) || 1;
      question.maxValue = parseInt(scaleInputs[1].value) || 5;
    }
    
    questions.push(question);
  });
  
  const surveyData = { 
    title, 
    description, 
    questions,
    surveyId: `survey_${Date.now()}`,
    adminToken: Math.random().toString(36).substring(2, 15)
  };
  
  // Validate
  if (!title || questions.length === 0) {
    alert('Please complete the survey');
    return;
  }
  
  // Now boot BrowserPod with the survey data
  await bootPodAndServeSurvey(surveyData);
}

function showSurveySuccess(surveyInfo) {
  // Create overlay with success message and QR code
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 40px;
    max-width: 500px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  `;
  
  modal.innerHTML = `
    <h2 style="color: #333; margin: 0 0 10px 0;">🎉 Survey Ready!</h2>
    <p style="color: #666; margin: 0 0 30px 0;">Your survey has been created and is ready to receive responses.</p>
    
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 30px 0;">
      <p style="color: #999; font-size: 0.85rem; margin: 0 0 10px 0;">Survey ID:</p>
      <p style="color: #333; font-weight: bold; margin: 0 0 20px 0; font-family: monospace;">${surveyInfo.surveyId}</p>
      
      <p style="color: #999; font-size: 0.85rem; margin: 0 0 10px 0;">Scan to take the survey:</p>
      <div id="qrcode-display" style="background: white; padding: 20px; border-radius: 6px; display: inline-block; margin: 0 auto;"></div>
    </div>
    
    <div style="margin: 30px 0; padding: 20px; background: #f0f8ff; border-radius: 8px;">
      <p style="color: #999; font-size: 0.85rem; margin: 0 0 8px 0;">Client Survey Link:</p>
      <input type="text" value="${surveyInfo.clientUrl}" readonly style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.85rem; box-sizing: border-box;">
    </div>
    
    <p style="color: #999; font-size: 0.8rem; margin: 20px 0 0 0;">The admin dashboard is open in the iframe below for you to monitor responses.</p>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Generate QR code using qrcode library
  const qrDiv = modal.querySelector('#qrcode-display');
  QRCode.toCanvas(surveyInfo.clientUrl, {
    width: 250,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' }
  }, (err, canvas) => {
    if (err) {
      qrDiv.innerHTML = '<p style="color: #999;">QR code generation failed</p>';
    } else {
      qrDiv.innerHTML = '';
      qrDiv.appendChild(canvas);
      
      // ALWAYS populate admin page QR code
      setTimeout(() => {
        const adminQrDiv = document.getElementById('qrCode');
        // Create a smaller canvas for admin page
        QRCode.toCanvas(surveyInfo.clientUrl, {
          width: 200,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' }
        }, (err2, adminCanvas) => {
          if (!err2 && adminQrDiv) {
            adminQrDiv.innerHTML = '';
            adminQrDiv.appendChild(adminCanvas);
          }
        });
      }, 100);
    }
  });
  
  // Close overlay when clicking outside
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}

async function bootPodAndServeSurvey(surveyData) {
  try {
    // Show loading state
    const appContainer = document.getElementById('app-container');
    appContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #666;"><p>🚀 Starting survey environment...</p></div>';
    
    // Boot BrowserPod
    console.log('Booting BrowserPod...');
    pod = await BrowserPod.boot({apiKey: import.meta.env.VITE_BP_APIKEY});
    console.log('BrowserPod booted successfully');
    
    // Wait a moment for WASM to fully initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Debug: Check what properties/methods are available on pod
    console.log('Pod properties:', Object.keys(pod));
    console.log('Pod methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(pod)));
    
    // Create a Terminal for output using existing element
    const terminal = await pod.createDefaultTerminal(document.querySelector('#console'));
    
    // Create directory for project files
    console.log('Creating /project directory...');
    await pod.createDirectory('/project');
    console.log('Directory created');
    
    // Create public subdirectory
    console.log('Creating /project/public directory...');
    try {
      await pod.createDirectory('/project/public');
      console.log('Public directory created');
    } catch (e) {
      console.log('Public directory note:', e.message);
    }
    
    // Copy project files
    console.log('Copying files...');
    await copyFile(pod, 'project/main.js');
    await copyFile(pod, 'project/package.json');
    
    // Copy public frontend files
    await copyFile(pod, 'project/public/app.html');
    await copyFile(pod, 'project/public/survey.html');
    await copyFile(pod, 'project/public/admin.html');
    await copyFile(pod, 'project/public/results.html');
    console.log('Files copied');
    
    // Create survey data file BEFORE npm install
    console.log('Creating survey data file...');
    const surveyDataJson = JSON.stringify(surveyData);
    const surveyDataContent = `module.exports = ${surveyDataJson};`;
    const surveyDataFile = await pod.createFile('/project/survey-data.js', 'binary');
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(surveyDataContent);
    const buffer = encodedData.buffer.slice(encodedData.byteOffset, encodedData.byteOffset + encodedData.byteLength);
    await surveyDataFile.write(buffer);
    await surveyDataFile.close();
    console.log('Survey data file created');
    
    // Install dependencies
    console.log('Installing npm dependencies...');
    await pod.run('npm', ['install'], {echo: false, terminal: terminal, cwd: '/project'});
    console.log('Dependencies installed');
    
    // Start the server
    console.log('Starting Express server...');
    pod.run('node', ['main.js'], {echo: false, terminal: terminal, cwd: '/project'});
    console.log('Server started');
    
    // Wait for portal and show it with admin page
    pod.onPortal(({ url, port }) => {
      console.log('Portal ready at:', url);
      
      // Navigate to admin page with token
      const adminUrl = `${url}/admin/${surveyData.surveyId}?token=${surveyData.adminToken}`;
      
      // Hide creator, show portal
      document.getElementById('app-container').style.display = 'none';
      document.getElementById('portal-container').style.display = 'block';
      document.getElementById('portal').src = adminUrl;
      
      // Display success message with QR code
      setTimeout(() => {
        showSurveySuccess({
          surveyId: surveyData.surveyId,
          adminToken: surveyData.adminToken,
          clientUrl: `${url}/survey/${surveyData.surveyId}`,
          adminUrl: adminUrl,
          portalUrl: url
        });
      }, 2000);
    });
    
  } catch (error) {
    console.error('Failed to boot survey environment:', error);
    const appContainer = document.getElementById('app-container');
    appContainer.innerHTML = `<div style="padding: 40px; color: red;"><p>❌ Error: ${error.message}</p><p style="font-size: 0.9rem; color: #666;">Check browser console for details.</p><button onclick="location.reload()" style="padding: 10px 20px; margin-top: 20px;">Try Again</button></div>`;
  }
}
