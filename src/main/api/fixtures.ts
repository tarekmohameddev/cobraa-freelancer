export const loginFixture = {
  success: true,
  code: 200,
  data: {
    userInfo: { uid: 1001 },
    token: 'mock-session-token'
  }
}

export const chatFixture = {
  retCode: '0000',
  data: {
    choices: [
      {
        message: {
          role: 'assistant',
          content:
            'This is a mocked chat reply (live vendor APIs are disabled in this workspace).\n\nYou said: {{message}}'
        }
      }
    ]
  }
}

export const translateFixture = {
  status: 10010,
  texts: '{{text}}'
}

export const ocrFixture = {
  status: 10000,
  data: [
    { DetectedText: 'Sample OCR line 1 — recorded/mock response' },
    { DetectedText: 'Invoice #1842   Total $42.00' },
    { DetectedText: 'Cobraa mouse extra-button prototype' }
  ]
}

export const speechTranscript = 'Hello, this is a mocked voice transcript.'
