'use client';

import { TextField, Button } from '@bcgov/design-system-react-components';
import { FaMagnifyingGlass } from 'react-icons/fa6';
import { useDictionary } from '@/app/[lang]/Providers';
import styles from './ListPageSearchField.module.css';

type ListPageSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  testIdPrefix: string;
  showSearchButton?: boolean;
};

export function ListPageSearchField({
  value,
  onChange,
  testIdPrefix,
  showSearchButton = false,
}: Readonly<ListPageSearchFieldProps>) {
  const dict = useDictionary();

  return (
    <div className={`d-flex gap-2 ${styles.searchField}`}>
      <TextField
        aria-label={dict.general.search}
        label={dict.general.search}
        data-testid={`search-${testIdPrefix}-text`}
        value={value}
        onChange={onChange}
        iconRight={<FaMagnifyingGlass />}
        className={`${styles.searchBox}`}
      />
      {showSearchButton && (
        <div className="d-flex align-items-end">
          <Button
            variant="secondary"
            data-testid={`search-${testIdPrefix}-button`}
            onClick={() => onChange(value)}
          >
            {dict.general.search}
          </Button>
        </div>
      )}
    </div>
  );
}
