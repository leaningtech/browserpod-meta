const express = require('express')
const app = express()
const port = 3000

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Hello from BrowserPod</title>
      <style>
        body {
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: system-ui, -apple-system, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .content {
          text-align: center;
        }
        h1 {
          font-size: 3rem;
          margin: 0 0 0.5rem 0;
        }
        p {
          font-size: 1.25rem;
          opacity: 0.9;
        }
      </style>
    </head>
    <body>
      <div class="content">
        <h1>Hello World! 👋</h1>
        <p>Express.js running in BrowserPod</p>
      </div>
    </body>
    </html>
  `)
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
