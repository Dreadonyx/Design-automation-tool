// Assembles workflow/design-agent-workflow.json from the src/*.js Code-node sources.
// Run: node build.js

const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');

const prepareClaude = read('prepare-claude.js');
const generateDesigns = read('generate-designs.js');
const formPage = read('form-page.js');

const workflow = {
  name: 'Design Agent — theme & background generator',
  nodes: [
    {
      parameters: {
        httpMethod: 'GET',
        path: 'design-agent',
        responseMode: 'responseNode',
        options: {}
      },
      id: 'wh-trigger-0001',
      name: 'Webhook Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [-860, 40]
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
          conditions: [
            {
              id: 'cond-brief-0001',
              leftValue: "={{ $json.query && $json.query.brief ? $json.query.brief : '' }}",
              rightValue: '',
              operator: { type: 'string', operation: 'notEmpty', singleValue: true }
            }
          ],
          combinator: 'and'
        },
        options: {}
      },
      id: 'if-brief-0001',
      name: 'Has Brief?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [-620, 40]
    },
    {
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: prepareClaude
      },
      id: 'code-prep-0001',
      name: 'Prepare Claude Request',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-380, -60]
    },
    {
      parameters: {
        method: 'POST',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: 'Bearer YOUR_API_KEY_HERE' },
            { name: 'Content-Type', value: 'application/json' }
          ]
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.body) }}',
        options: { timeout: 90000 }
      },
      id: 'http-claude-0001',
      name: 'Claude Theme Designer',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [-140, -60],
      onError: 'continueRegularOutput'
    },
    {
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: generateDesigns
      },
      id: 'code-gen-0001',
      name: 'Generate Designs',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [100, -60]
    },
    {
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: formPage
      },
      id: 'code-form-0001',
      name: 'Form Page',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-380, 200]
    },
    {
      parameters: {
        respondWith: 'text',
        responseBody: '={{ $json.html }}',
        options: {
          responseHeaders: {
            entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }]
          }
        }
      },
      id: 'respond-0001',
      name: 'Send Response',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [360, 40]
    }
  ],
  connections: {
    'Webhook Trigger': { main: [[{ node: 'Has Brief?', type: 'main', index: 0 }]] },
    'Has Brief?': {
      main: [
        [{ node: 'Prepare Claude Request', type: 'main', index: 0 }],
        [{ node: 'Form Page', type: 'main', index: 0 }]
      ]
    },
    'Prepare Claude Request': { main: [[{ node: 'Claude Theme Designer', type: 'main', index: 0 }]] },
    'Claude Theme Designer': { main: [[{ node: 'Generate Designs', type: 'main', index: 0 }]] },
    'Generate Designs': { main: [[{ node: 'Send Response', type: 'main', index: 0 }]] },
    'Form Page': { main: [[{ node: 'Send Response', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' },
  pinData: {}
};

const out = path.join(__dirname, 'workflow', 'design-agent-workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2));

// sanity: round-trip parse + code sources intact
const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
if (parsed.nodes.length !== 7) throw new Error('node count mismatch');
if (!parsed.nodes.find(n => n.name === 'Generate Designs').parameters.jsCode.includes('genOne')) {
  throw new Error('generate-designs source not embedded');
}
console.log('OK →', out, '(' + (fs.statSync(out).size / 1024).toFixed(1) + ' KB)');
