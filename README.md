Docker image for deploying covid19japan automation scripts to a Google Cloud Run instance.

# Auth

`credentials.json` need to be created (see mhlw.py for info).

# Development

```
./build.sh
```

# Deployment

```
./deploy.sh
```

# Testing

test.py is used as a rig to test functions so that they work when called from Flask.