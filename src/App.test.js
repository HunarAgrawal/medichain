import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('axios', () => ({
  post: jest.fn()
}));

jest.mock('./blockchainService', () => ({
  connectWallet: jest.fn(),
  registerRecord: jest.fn(),
  getRecord: jest.fn(),
  addReport: jest.fn()
}));

test('renders Medichain patient record workflow', () => {
  render(<App />);

  expect(screen.getByRole('heading', { name: /medichain/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /create new patient record/i })).toBeInTheDocument();
});
