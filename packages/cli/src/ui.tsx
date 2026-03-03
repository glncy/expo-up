import * as React from "react";
import { Box, Text } from "ink";
import figlet from "figlet";

type Tone =
  | "cyan"
  | "green"
  | "yellow"
  | "red"
  | "blue"
  | "magenta"
  | "gray"
  | "white";

interface CliCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

interface BadgeProps {
  label: string;
  tone?: Tone;
}

const EXPO_UP_BANNER = (() => {
  try {
    const figletApi =
      (figlet as unknown as { default?: typeof figlet }).default ?? figlet;
    return figletApi
      .textSync("expo-up", { font: "Standard" })
      .split("\n")
      .filter(Boolean);
  } catch {
    return ["expo-up"];
  }
})();

export const BrandHeader: React.FC<{ subtitle?: string }> = ({ subtitle }) => {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {EXPO_UP_BANNER.map((line) => (
        <Text key={line} color="cyan">
          {line}
        </Text>
      ))}
      {subtitle ? <Text color="gray">{subtitle}</Text> : null}
    </Box>
  );
};

export const CliCard: React.FC<CliCardProps> = ({
  title,
  subtitle,
  children,
}) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={0}
    >
      <Box>
        <Text color="cyan" bold>
          {title}
        </Text>
      </Box>
      {subtitle ? (
        <Box marginBottom={1}>
          <Text color="gray">{subtitle}</Text>
        </Box>
      ) : null}
      {children}
    </Box>
  );
};

export const Badge: React.FC<BadgeProps> = ({ label, tone = "white" }) => {
  return (
    <Box marginRight={1}>
      <Text color={tone}>{`[${label}]`}</Text>
    </Box>
  );
};

export const KV: React.FC<{
  keyName: string;
  value: string;
  valueColor?: Tone;
}> = ({ keyName, value, valueColor = "white" }) => {
  return (
    <Box>
      <Text color="gray">{keyName.padEnd(10)}</Text>
      <Text color={valueColor}>{value}</Text>
    </Box>
  );
};
