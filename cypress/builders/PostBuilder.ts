export type MockPost = {
  id: number;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  isPinned: boolean;
};

export const buildMockPost = (overrides: Partial<MockPost> = {}): MockPost => {
  const nowIso = new Date().toISOString();

  return {
    id: 1,
    title: 'Post de prueba',
    content: 'Contenido de prueba para Cypress.',
    tags: ['General'],
    createdAt: nowIso,
    isPinned: false,
    ...overrides,
  };
};

