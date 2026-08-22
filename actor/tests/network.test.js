const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConnections } = require('../src/network');

test('normaliza el contrato enriquecido que consume el panel', () => {
  const [contact] = normalizeConnections([{
    firstName: 'Ana',
    lastName: 'Pérez',
    currentTitle: 'CTO',
    currentCompany: 'Acme',
    location: 'Bogotá',
    profileUrl: 'https://linkedin.com/in/ana',
    profilePictureUrl: 'https://img.example/ana.jpg',
    about: 'Lidero equipos de plataforma',
    industry: 'Software',
    experience: [{ title: 'Lead', companyName: 'PrevCo' }],
    schools: [{ schoolName: 'Uniandes' }],
    followerCount: '1200',
    numConnections: '500',
  }], 10);

  assert.deepEqual(contact, {
    id: 'c0',
    name: 'Ana Pérez',
    headline: 'CTO at Acme',
    company: 'Acme',
    position: 'CTO',
    location: 'Bogotá',
    url: 'https://linkedin.com/in/ana',
    currentCompany: 'Acme',
    currentTitle: 'CTO',
    description: 'Lidero equipos de plataforma',
    industry: 'Software',
    workHistory: [{ title: 'Lead', companyName: 'PrevCo' }],
    education: [{ schoolName: 'Uniandes' }],
    followers: 1200,
    connectionsCount: 500,
    photoUrl: 'https://img.example/ana.jpg',
    connectedOn: '',
  });
});
