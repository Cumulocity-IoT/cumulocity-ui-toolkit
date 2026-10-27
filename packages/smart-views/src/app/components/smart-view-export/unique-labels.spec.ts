import { uniqueLabels } from './smart-view-export-modal.component';

describe('uniqueLabels', () => {
  it('numbers repeated labels so no export column overwrites another', () => {
    expect(uniqueLabels(['Type', 'Name', 'Type', 'Type'])).toEqual([
      'Type',
      'Name',
      'Type (2)',
      'Type (3)',
    ]);
  });

  it('skips numbers that are already taken by a real label', () => {
    expect(uniqueLabels(['Type (2)', 'Type', 'Type'])).toEqual(['Type (2)', 'Type', 'Type (3)']);
  });
});
