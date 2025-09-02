import { Typography, Stack, Box, type SxProps, Skeleton } from '@mui/material';
import { DataGrid, type DataGridProps } from '@mui/x-data-grid';
import { CustomChip } from '@/components/custom-chip.tsx';
import { ErrorState } from '@/components/error-state.tsx';
import type { Theme } from '@mui/material/styles';
import { useHeader } from '@/hooks/use-header.ts';
import { useApi } from '@/hooks/use-api.ts';
import Avatar from '@mui/material/Avatar';
import { Link } from 'react-router';
import { memoize } from 'lodash-es';
import { api } from '@/modules/api';
import { AxiosError } from 'axios';

import type {
  ActivityWhereInput,
  Resource,
  Action,
} from '@/types/backend-types.ts';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useMemo,
  type ReactElement,
} from 'react';

import type {
  ActivityListOutputSchema,
  ListInputSchema,
  ActivitySchema,
  UserSchema,
} from '@/types/schema.ts';

import type {
  GridColumnVisibilityModel,
  GridRenderCellParams,
  GridDataSource,
  GridColDef,
} from '@mui/x-data-grid';

import {
  AccountTreeOutlined as AccountTreeIcon,
  AccessTimeOutlined as AccessTimeIcon,
  CategoryOutlined as CategoryIcon,
  EditOutlined as EditOutlinedIcon,
  ScheduleOutlined as ScheduleIcon,
  RefreshOutlined as RefreshIcon,
  LinkOffOutlined as LinkOffIcon,
  WebhookOutlined as WebhookIcon,
  PlayArrowOutlined as PlayIcon,
  FolderOutlined as FolderIcon,
  CancelOutlined as CancelIcon,
  DeleteOutlined as DeleteIcon,
  ReplayOutlined as ReplayIcon,
  ShieldOutlined as ShieldIcon,
  PersonOutlined as PersonIcon,
  LogoutOutlined as LogoutIcon,
  CableOutlined as CableIcon,
  PowerOutlined as PowerIcon,
  LoginOutlined as LoginIcon,
  PlaceOutlined as PlaceIcon,
  MouseOutlined as MouseIcon,
  EditOutlined as EditIcon,
  AddOutlined as AddIcon,
} from '@mui/icons-material';

export interface ActivitiesProps {
  defaultPageSize?: number;
  hideColumns?: string[];
  embedded?: boolean;
  userId?: number;
}

interface EnumDef {
  resource?: Resource | Resource[];
  action?: Action | Action[];
  subAction?: string | string[];
  label: string;
  icon?: ReactElement;
  color?: string;
}

const Actions: EnumDef[] = [
  {
    resource: 'USER',
    subAction: 'LOGIN',
    label: 'Logged in',
    icon: <LoginIcon />,
    color: '#1f7a1f',
  },
  {
    resource: 'USER',
    subAction: 'LOGOUT',
    label: 'Logged out',
    icon: <LogoutIcon />,
    color: '#7a1f1f',
  },
  {
    resource: 'USER',
    subAction: 'REFRESH_TOKEN',
    label: 'Session renewed',
    icon: <RefreshIcon />,
    color: '#1f4f7a',
  },
  {
    resource: 'USER',
    subAction: 'SELF_UPDATE',
    label: 'Profile updated',
    icon: <EditIcon />,
    color: '#00a6a0',
  },
  {
    resource: 'OAUTH2_AUTH_STATE',
    subAction: 'OAUTH2_INITIATE_AUTHORIZATION',
    label: 'Connection authorization initiated',
    icon: <PowerIcon />,
    color: '#800080',
  },
  {
    resource: 'OAUTH2_TOKEN',
    subAction: 'REFRESH_TOKEN',
    label: 'Connection token refreshed',
    icon: <RefreshIcon />,
    color: '#330080',
  },
  {
    resource: 'OAUTH2_TOKEN',
    subAction: 'OAUTH2_AUTHORIZATION',
    label: 'Connection established',
    icon: <CableIcon />,
    color: '#007a00',
  },
  {
    resource: 'OAUTH2_TOKEN',
    subAction: 'OAUTH2_DISCONNECT',
    label: 'Connection disconnected',
    icon: <LinkOffIcon />,
    color: '#a60000',
  },
  {
    resource: 'JOB',
    subAction: 'RESUME',
    label: 'Job resumed',
    icon: <PlayIcon />,
    color: '#60007a',
  },
  {
    resource: 'JOB',
    subAction: 'CANCEL',
    label: 'Job canceled',
    icon: <CancelIcon />,
    color: '#a60000',
  },
  {
    resource: 'JOB',
    subAction: 'EXECUTE_DRAFT',
    label: 'Draft job executed',
    icon: <PlayIcon />,
    color: '#3f007a',
  },
  {
    resource: 'JOB',
    subAction: 'RUN',
    label: 'Job run',
    icon: <PlayIcon />,
    color: '#007a00',
  },
  {
    resource: 'JOB',
    subAction: 'REPLAY',
    label: 'Job replayed',
    icon: <ReplayIcon />,
    color: '#000a7a',
  },
  {
    action: 'CREATE',
    label: 'Created',
    icon: <AddIcon />,
    color: '#007a00',
  },
  {
    action: 'UPDATE',
    label: 'Updated',
    icon: <EditOutlinedIcon />,
    color: '#00a6a0',
  },
  {
    action: 'DELETE',
    label: 'Deleted',
    icon: <DeleteIcon />,
    color: '#a60000',
  },
];

const Resources: EnumDef[] = [
  {
    resource: 'USER',
    action: 'OTHER',
    subAction: ['LOGIN', 'LOGOUT', 'REFRESH_TOKEN'],
    label: 'Auth',
    icon: <ShieldIcon />,
    color: '#cfc500',
  },
  {
    resource: 'USER',
    action: ['CREATE', 'UPDATE', 'DELETE'],
    // subAction: ['SELF_UPDATE'],
    label: 'User',
    icon: <PersonIcon />,
    color: '#007abd',
  },
  {
    resource: ['OAUTH2_AUTH_STATE', 'OAUTH2_TOKEN'],
    label: 'Connection',
    icon: <CableIcon />,
    color: '#330080',
  },
  {
    resource: 'JOB',
    label: 'Job',
    icon: <PlayIcon />,
    color: '#008000',
  },
  {
    resource: 'WEBHOOK',
    label: 'Webhook',
    icon: <WebhookIcon />,
    color: '#00277a',
  },
  {
    resource: 'FOLDER',
    label: 'Folder',
    icon: <FolderIcon />,
    color: '#7a4f00',
  },
  {
    resource: 'SCHEDULE',
    label: 'Schedule',
    icon: <ScheduleIcon />,
    color: '#7a007a',
  },
  {
    resource: 'WORKFLOW',
    label: 'Workflow',
    icon: <AccountTreeIcon />,
    color: '#7a3f00',
  },
];

const findEnumDef = memoize(
  (
    def: 'action' | 'resource',
    resource?: Resource,
    action?: Action,
    subAction?: string,
  ) =>
    (def === 'action' ? Actions : Resources).find((def) => {
      const resourceMatch =
        !def.resource ||
        (Array.isArray(def.resource)
          ? def.resource.includes(resource!)
          : def.resource === resource);
      const actionMatch =
        !def.action ||
        (Array.isArray(def.action)
          ? def.action.includes(action!)
          : def.action === action);
      const subActionMatch =
        !def.subAction ||
        (Array.isArray(def.subAction)
          ? def.subAction.includes(subAction!)
          : def.subAction === subAction);

      return resourceMatch && actionMatch && subActionMatch;
    }),
  (def, resource, action, subAction) =>
    `${def}-${resource}-${action}-${subAction}`,
);

const findEnumDefByLabel = memoize(
  (def: 'action' | 'resource', label: string) =>
    (def === 'action' ? Actions : Resources).find((d) => d.label === label),
  (def, label) => `${def}-${label}`,
);

const getEnumDefFilterCondition = memoize(
  (def: EnumDef): ActivityWhereInput[] => {
    const fields = ['resource', 'action', 'subAction'] as const;

    return fields
      .map((field) => {
        if (!def[field]) {
          return null;
        }

        const value = Array.isArray(def[field]) ? def[field] : [def[field]];

        if (value.length === 1) {
          return { [field]: value[0] };
        }

        return { [field]: { in: value } };
      })
      .filter(Boolean) as ActivityWhereInput[];
  },
);

const getUser = memoize(async (id: number) =>
  api.get<UserSchema>(`/users/${id}`).then(({ data }) => data),
);

function renderHeaderWithIcon(icon: ReactNode): GridColDef['renderHeader'] {
  return (params) => (
    <Stack
      justifyContent="center"
      alignItems="center"
      direction="row"
      gap={0.6}
    >
      {icon}

      <Typography variant="body2" fontWeight={600}>
        {params.colDef.headerName}
      </Typography>
    </Stack>
  );
}

function ActionCell({
  params,
}: {
  params: GridRenderCellParams<ActivitySchema, Action>;
}) {
  const { action, resource, subAction } = params.row;

  const config = useMemo(() => {
    let label: string = subAction ?? action;
    let icon = <MouseIcon />;
    let color = '#566481';

    const def = findEnumDef(
      'action',
      resource ?? undefined,
      action,
      subAction ?? undefined,
    );

    if (def) {
      label = def.label;
      icon = def.icon ?? icon;
      color = def.color ?? color;
    }

    return { label, icon, color };
  }, [action, resource, subAction]);

  return (
    <CustomChip icon={config.icon} label={config.label} color={config.color} />
  );
}

function ResourceCell({
  params,
}: {
  params: GridRenderCellParams<ActivitySchema, Action>;
}) {
  const { resource, subAction } = params.row;

  const config = useMemo(() => {
    let label: string = resource ?? 'Unknown';
    let color: string = '#566481';
    let icon = <CategoryIcon />;

    const def = findEnumDef(
      'resource',
      resource ?? undefined,
      params.row.action,
      subAction ?? undefined,
    );

    if (def) {
      label = def.label;
      icon = def.icon ?? icon;
      color = def.color ?? color;
    }

    return { label, color, icon };
  }, [params.row.action, resource, subAction]);

  return (
    <CustomChip label={config.label} color={config.color} icon={config.icon} />
  );
}

function IpCell({
  params,
}: {
  params: GridRenderCellParams<ActivitySchema, string>;
}) {
  const details = params.row.details as
    | { ip?: string; country?: string }
    | undefined;

  if (typeof details?.ip !== 'string') {
    return null;
  }

  return `${details?.country ?? ''} ${details?.ip}`;
}

function UserCell({
  params,
}: {
  params: GridRenderCellParams<ActivitySchema, string>;
}) {
  const { row } = params;

  const [user, setUser] = useState<UserSchema | null>(null);

  useEffect(() => {
    if (!row.userId) {
      return;
    }

    let isMounted = true;

    getUser(row.userId)
      .then((data) => {
        if (isMounted) {
          setUser(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUser({
            id: row.userId!,
            name: 'Unknown',
          } as UserSchema);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [row.userId]);

  return (
    <Stack
      to={user ? `/users/${user.id}` : '#'}
      justifyContent="center"
      alignItems="center"
      component={Link}
      direction="row"
      height="100%"
      gap={1}
    >
      {!user ? (
        <>
          <Skeleton variant="circular" width={40} height={40} />
          <Skeleton variant="text" width={100} height={30} />
        </>
      ) : (
        <>
          <Avatar
            src={`/api/users/${user.id}/avatar?t=${user.updatedAt}`}
            alt={user.name ?? user.email ?? 'User'}
            sx={{ width: 35, height: 35 }}
          />

          <Typography variant="body2" fontWeight={500}>
            {user.name ?? user.email}
          </Typography>
        </>
      )}
    </Stack>
  );
}

const columns: GridColDef[] = [
  {
    field: 'action',
    headerName: 'Action',
    flex: 1,
    headerAlign: 'center',
    align: 'center',
    sortable: false,
    type: 'singleSelect',
    renderHeader: renderHeaderWithIcon(<MouseIcon fontSize="small" />),
    renderCell: (params) => <ActionCell params={params} />,
    valueOptions: Actions.map((def) => def.label),
  },
  {
    field: 'resource',
    headerName: 'Resource',
    flex: 1,
    headerAlign: 'center',
    align: 'center',
    sortable: false,
    type: 'singleSelect',
    renderHeader: renderHeaderWithIcon(<CategoryIcon fontSize="small" />),
    renderCell: (params) => <ResourceCell params={params} />,
    valueOptions: Resources.map((def) => def.label),
  },
  {
    field: 'user',
    headerName: 'User',
    type: 'custom',
    flex: 1,
    headerAlign: 'center',
    align: 'center',
    sortable: false,
    filterable: false,
    renderHeader: renderHeaderWithIcon(<PersonIcon fontSize="small" />),
    renderCell: (params) => <UserCell params={params} />,
  },
  {
    field: 'ip',
    headerName: 'IP Address',
    type: 'string',
    flex: 1,
    headerAlign: 'center',
    align: 'center',
    sortable: false,
    filterable: false,
    renderHeader: renderHeaderWithIcon(<PlaceIcon fontSize="small" />),
    renderCell: (params) => <IpCell params={params} />,
  },
  {
    field: 'createdAt',
    headerName: 'Date & Time',
    type: 'dateTime',
    flex: 1,
    headerAlign: 'center',
    align: 'center',
    sortable: true,
    filterable: false,
    valueGetter: (value: string) => new Date(value),
    renderHeader: renderHeaderWithIcon(<AccessTimeIcon fontSize="small" />),
  },
];

const getRowId = (row: ActivitySchema) => row.id;

const getRowClassName: Exclude<DataGridProps['getRowClassName'], undefined> = (
  params,
) => (params.indexRelativeToCurrentPage % 2 === 0 ? 'even' : 'odd');

const tableStyle: SxProps<Theme> = {
  '& .odd': {
    bgcolor: (theme) =>
      theme.palette.mode === 'dark' ? 'action.hover' : 'grey.50',
  },
};

const slotProps: DataGridProps['slotProps'] = {
  filterPanel: {
    filterFormProps: {
      logicOperatorInputProps: {
        variant: 'outlined',
        size: 'small',
      },
      columnInputProps: {
        variant: 'outlined',
        size: 'small',
        sx: { mt: 'auto' },
      },
      operatorInputProps: {
        variant: 'outlined',
        size: 'small',
        sx: { mt: 'auto' },
      },
      valueInputProps: {
        InputComponentProps: {
          variant: 'outlined',
          size: 'small',
        },
      },
    },
  },
};

const autosizeOptions: DataGridProps['autosizeOptions'] = {
  expand: true,
};

const pageSizeOptions = [10, 20, 30];

export function Activities(props: ActivitiesProps) {
  const { UI: updateHeaderUI } = useHeader();
  const { api } = useApi();

  const [error, setError] = useState<AxiosError | string | null>(null);

  const getRows = useCallback<GridDataSource['getRows']>(
    async (params) => {
      try {
        const { page, pageSize } = params.paginationModel ?? {};
        const filter: ActivityWhereInput[] = [];

        for (const item of params.filterModel.items) {
          if (
            (item.field === 'action' || item.field === 'resource') &&
            item.value
          ) {
            const def = findEnumDefByLabel(item.field, item.value as string);

            if (!def) {
              continue;
            }

            filter.push(...getEnumDefFilterCondition(def));
          }
        }

        if (props.userId) {
          filter.push({ userId: props.userId });
        }

        const { data } = await api.get<ActivityListOutputSchema>(
          '/activities',
          {
            params: {
              page: (page ?? 0) + 1, // API is 1-based, DataGrid is 0-based
              limit: pageSize ?? props.defaultPageSize ?? 20,
              sortField: 'createdAt',
              sortOrder: params.sortModel[0]?.sort ?? 'desc',
              filter: JSON.stringify({
                [params.filterModel.logicOperator === 'and' ? 'AND' : 'OR']:
                  filter,
              }),
            } as ListInputSchema,
          },
        );

        return {
          rowCount: data.count,
          rows: data.data,
          pageInfo: {
            hasNextPage: data.hasNext,
          },
        };
      } catch (e) {
        if (e instanceof AxiosError) {
          setError(e);
        }

        throw e; // Rethrow the error to be handled by the DataGrid
      }
    },
    [api, props.defaultPageSize, props.userId],
  );

  const dataSource = useMemo<DataGridProps['dataSource']>(
    () => ({ getRows }),
    [getRows],
  );

  const initialState: DataGridProps['initialState'] = useMemo(
    () => ({
      pagination: {
        paginationModel: { pageSize: props.defaultPageSize ?? 20 },
      },
    }),
    [props.defaultPageSize],
  );

  const wrapperStyle = useMemo<SxProps<Theme>>(
    () => ({
      mx: 'auto',
      px: props.embedded ? 0 : { xs: 1, sm: 2 },
      width: '100%',
      flexGrow: 1,
    }),
    [props.embedded],
  );

  const columnVisibilityModel = useMemo(
    () =>
      props.hideColumns?.reduce(
        (model, col) => {
          model[col] = false;
          return model;
        },
        {} as GridColumnVisibilityModel,
      ),
    [props.hideColumns],
  );

  useEffect(() => {
    updateHeaderUI({
      search: false,
      datePicker: true,
      loading: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box sx={wrapperStyle}>
      {/* Error */}
      {error ? (
        <ErrorState error={error} />
      ) : (
        <DataGrid
          columnVisibilityModel={columnVisibilityModel}
          autosizeOptions={autosizeOptions}
          getRowClassName={getRowClassName}
          onDataSourceError={console.error}
          pageSizeOptions={pageSizeOptions}
          initialState={initialState}
          dataSource={dataSource}
          slotProps={slotProps}
          rowSelection={false}
          sortingMode="server"
          filterMode="server"
          getRowId={getRowId}
          columns={columns}
          autosizeOnMount
          sx={tableStyle}
        />
      )}
    </Box>
  );
}
