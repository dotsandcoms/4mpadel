import { createContext, useContext } from 'react';
import { lightBrand } from '@/theme/tokens';

export const profileColors = {
  ...lightBrand,
  accent: '#2449D8',
  padel: '#2449D8',
  soft: 'rgba(36,73,216,0.12)',
  selection: 'rgba(36,73,216,0.35)',
};

export const FieldColors = createContext<typeof profileColors>(profileColors);
export const useFieldColors = () => useContext(FieldColors);
