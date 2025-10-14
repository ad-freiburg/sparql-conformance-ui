# qlever-conformance-website

Website to **visualize** the result files of the [sparql-conformance](https://github.com/ad-freiburg/sparql-conformance).

## Prerequisites

Docker.

## Setup

1. Clone this repository.

2. If you want to use it with the GitHub App + Workflow & upload server click [here](https://github.com/SIRDNARch/qlever-sparql-conformance-platform)

3. If you just want to look at results: 

### Docker
#### Build:
```
docker build -t sparql-conformance-ui . 
```

#### Run:
Replace PORT and PATH
```
docker run --name sparql-conformance-ui -d -p PORT:3000 -v PATH:/public/results sparql-conformance-ui
```
Example mount: 
```
-v /Users/username/Desktop/project/results:/public/results
```

This mounts your directory (which is the first path, do not change the second path) to the results directory used by the server.

Set it to the directory containing the result files.

