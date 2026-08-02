# Private Deployment Notes

Detailed production deployment settings are intentionally not stored in this
public repository.

Use the hosting provider dashboards to configure:

- Frontend environment variables
- Backend environment variables
- Database credentials
- API keys for maps, AI, SMS, and email providers
- Production domains and callbacks

Only placeholder `.env.example` files should be committed. Real values must stay
in local `.env` files or private hosting-provider environment settings.
