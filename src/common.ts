import { HTTPRequest } from "puppeteer"

const config = {
    resourceTypes: 'document font stylesheet script image manifest other fetch'.split(' ')
}

export function isResourceCacheable(request: HTTPRequest) {
    return true;

    const resourceType = request.resourceType()
    return config.resourceTypes.includes(resourceType)
}


export {
    config
}