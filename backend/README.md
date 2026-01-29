## CS Submit Form Wrapper

### Overview

This repository serves an api. This API uses configurable JWT secret, issuer and audience to handle user verification.
Inside that JWT it has a configurable field called ROLE_FIELD which it uses to verify the user permissions. Given those permissions it will pass off calls to /api/formio/\* to formio using the credentials in formio which are configurable and as an example ADMIN and MANAGER users are supported with different FORMIO_ADMIN_USERNAME, FORMIO_ADMIN_PASSWORD and FORMIO_MANAGER_USERNAME FORMIO_MANAGER_PASSWORD

### Language

The Api is written in typescipt and uses the express library for routing and the passport js library for authentication

### Node Version

This repository is built with node v24.4.1 and is set up inside the .nvmrc

### Docker

The docker file exists but is untested

### Form Wrapper

This project serves as a wrapper for formio currnetly, but it is not tied to formio, it can wrap other projects and multiple projects
