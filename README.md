## Prerequisites

Ensure you have the following installed on your system:

- **Node.js**: v23.11.1 or higher
- **pnpm**: v8 or higher
- **PostgreSQL**: Ensure a PostgreSQL database is running and accessible.
- **Redis**: Ensure a Redis instance is running.

## Project Setup

1. Clone the repository:

   ```bash
   git clone git@github.com:IbrahimWeNexus/hbh-erp.git
   cd hbh-erp
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Copy the `.env.example` file to `.env` and configure the environment variables:

   ```bash
   cp .env.example .env
   ```

   Update the `.env` file with your database, Redis, and other required configurations.

4. Set up the database:

   Run Prisma migrations to set up the database schema:

   ```bash
   pnpm prisma migrate dev
   ```

5. Generate Prisma client:

   ```bash
   pnpm prisma generate
   ```

## Running the Project

### Development Mode

To start the project in development mode:

```bash
pnpm run start
```

This will:

- Start the API server on `http://localhost:3001`
- Start the UI on `http://localhost:3002`

### Production Mode

To start the project in production mode:

```bash
pnpm run start --prod
```

This will:

- Start the API and worker processes using Node.js clustering.

## API Documentation

Once the project is running, you can access the REST API documentation at:

```
http://localhost:3001/api
```

## Scripts

- **Linting**: Run ESLint to check and fix code issues:

  ```bash
  pnpm run lint
  ```

- **Formatting**: Format code using Prettier:

  ```bash
  pnpm run format
  ```

- **Testing**: Run unit tests using Vitest:

  ```bash
  pnpm run test
  ```

- **Build UI**: Build the UI for production:

  ```bash
  pnpm run build
  ```

## Environment Variables

Key environment variables to configure in the `.env` file:

- `DATABASE_URL`: PostgreSQL connection string.
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Redis configuration.
- `APP_URL`: Base URL of the application.
- `API_PORT`, `UI_PORT`: Ports for the API and UI servers.

Refer to the `.env.example` file for the full list of variables.