// app/_layout.tsx — Updated root layout with all new tabs

import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../src/theme';
import { useProjectStore, useTokenStore, useCorrectionsStore } from '../src/store';

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={[S.icon, focused && S.iconActive]}>
      <Text style={S.emoji}>{emoji}</Text>
      <Text style={[S.label, { color: focused ? colors.primary : colors.textDim }]}>{label}</Text>
    </View>
  );
}

const S = StyleSheet.create({
  icon:       { alignItems: 'center', justifyContent: 'center', paddingTop: 6, gap: 2 },
  iconActive: {},
  emoji:      { fontSize: 18 },
  label:      { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
});

export default function RootLayout() {
  const { load: loadProjects }     = useProjectStore();
  const { load: loadTokens }       = useTokenStore();
  const { load: loadCorrections }  = useCorrectionsStore();

  useEffect(() => {
    loadProjects();
    loadTokens();
    loadCorrections();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={colors.bg} />
        <Tabs
          screenOptions={{
            headerStyle:             { backgroundColor: colors.bg, borderBottomColor: colors.border, borderBottomWidth: 1 },
            headerTitleStyle:        { color: colors.text, fontSize: 17, fontWeight: '700' },
            headerTintColor:         colors.primary,
            tabBarStyle:             {
              backgroundColor:      colors.bgCard,
              borderTopColor:       colors.border,
              borderTopWidth:       1,
              height:               Platform.OS === 'ios' ? 84 : 60,
              paddingBottom:        Platform.OS === 'ios' ? 24 : 4,
            },
            tabBarShowLabel:         false,
            tabBarActiveTintColor:   colors.primary,
            tabBarInactiveTintColor: colors.textDim,
          }}
        >
          {/* Chat */}
          <Tabs.Screen
            name="index"
            options={{
              headerTitle: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: colors.primary, fontSize: 20 }}>⚡</Text>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 }}>myai</Text>
                </View>
              ),
              tabBarIcon: ({ focused }) => <TabIcon emoji="💬" label="Chat" focused={focused} />,
            }}
          />

          {/* Projects */}
          <Tabs.Screen
            name="projects"
            options={{
              title: 'Projects',
              tabBarIcon: ({ focused }) => <TabIcon emoji="📁" label="Projects" focused={focused} />,
            }}
          />

          {/* Agent + Skills + Review */}
          <Tabs.Screen
            name="agent"
            options={{
              title: 'Agent',
              tabBarIcon: ({ focused }) => <TabIcon emoji="🤖" label="Agent" focused={focused} />,
            }}
          />

          {/* Provider switcher */}
          <Tabs.Screen
            name="providers"
            options={{
              title: 'Models',
              tabBarIcon: ({ focused }) => <TabIcon emoji="🧭" label="Models" focused={focused} />,
            }}
          />

          {/* GitHub */}
          <Tabs.Screen
            name="github"
            options={{
              title: 'GitHub',
              tabBarIcon: ({ focused }) => <TabIcon emoji="🐙" label="GitHub" focused={focused} />,
            }}
          />

          {/* Figma */}
          <Tabs.Screen
            name="figma"
            options={{
              title: 'Figma',
              tabBarIcon: ({ focused }) => <TabIcon emoji="🎨" label="Figma" focused={focused} />,
            }}
          />

          {/* Memory */}
          <Tabs.Screen
            name="memory"
            options={{
              title: 'Memory',
              tabBarIcon: ({ focused }) => <TabIcon emoji="🧠" label="Memory" focused={focused} />,
            }}
          />

          {/* Settings */}
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" label="Settings" focused={focused} />,
            }}
          />
        </Tabs>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
