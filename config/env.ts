import * as dotenv from 'dotenv';
dotenv.config();

export const env = {
  baseUrl:        process.env.BASE_URL          ?? 'http://localhost:3000',
  senderEmail:    process.env.SENDER_EMAIL       ?? 'sender@test.com',
  senderPassword: process.env.SENDER_PASSWORD    ?? 'Test1234!',
  signerEmail:    process.env.SIGNER_EMAIL       ?? 'signer@test.com',
  signerPassword: process.env.SIGNER_PASSWORD    ?? 'Test1234!',
  inbucketUrl:    process.env.INBUCKET_URL       ?? 'http://localhost:9000',
  apiKey:         process.env.DOCUMENSO_API_KEY  ?? '',
} as const;