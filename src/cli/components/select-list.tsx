import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface SelectItem<T> {
  key: string;
  label: string;
  value: T;
  disabled?: boolean;
}

export interface SelectListProps<T> {
  items: SelectItem<T>[];
  onSelect: (value: T) => void;
}

function firstEnabledIndex<T>(items: SelectItem<T>[]): number {
  const idx = items.findIndex((i) => !i.disabled);
  return idx === -1 ? 0 : idx;
}

export function SelectList<T>({ items, onSelect }: SelectListProps<T>) {
  const [index, setIndex] = useState(() => firstEnabledIndex(items));

  useInput((_input, key) => {
    if (key.upArrow) {
      let i = index - 1;
      while (i >= 0 && items[i]?.disabled) i--;
      if (i >= 0) setIndex(i);
    } else if (key.downArrow) {
      let i = index + 1;
      while (i < items.length && items[i]?.disabled) i++;
      if (i < items.length) setIndex(i);
    } else if (key.return) {
      const current = items[index];
      if (current && !current.disabled) onSelect(current.value);
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const isActive = i === index && !item.disabled;
        const marker = i === index ? '›' : ' ';
        return (
          <Text
            key={item.key}
            color={isActive ? 'cyan' : undefined}
            dimColor={item.disabled}
          >
            {marker} {item.label}
          </Text>
        );
      })}
    </Box>
  );
}
