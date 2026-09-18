// sample.go
package main

import (
    "fmt"
    "net/http"
)

func fetchUrl(url string) {
    resp, err := http.Get(url)
    _ = err
    fmt.Println(resp.StatusCode)
}
