/**
 * 规则引擎入口。
 * 铁律：本目录只能是纯 TypeScript——不得引用 PixiJS、DOM 或浏览器 API，
 * 不得使用 Math.random() / Date.now()（随机数只用 rng.ts）。
 */
export const ENGINE_VERSION = '0.1.0';

export * from './rng';
export * from './schema';
export * from './hex';
export * from './projection';
export * from './map';
export * from './map-edit';
export * from './ratings';
export * from './units';
export * from './game';
export * from './session';
export * from './movement';
export * from './command-chain';
export * from './group-move';
export * from './plan';
export * from './disorganize';
export * from './combat';
export * from './combat-resolve';
export * from './calendar';
export * from './turn-end';
export * from './scenario';
