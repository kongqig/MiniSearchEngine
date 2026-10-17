$prot = 8085
Start-Process python -ArgumentList "-m","http.server",$prot
Start-Sleep -Milliseconds 800
start "http://127.0.0.1:$prot"