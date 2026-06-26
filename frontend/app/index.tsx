import { View } from 'react-native';

// AuthGate in _layout.tsx handles routing between /(tabs) and /sign-in.
// This file exists only because expo-router needs an `index` route; it
// renders nothing so the gate's redirect can take over.
export default function Index() {
  return <View />;
}
