"""
TEMPORARY dev defaults from Pulse curl — replace with backend/.env before production.
Set OPENOBSERVE_USE_HARDCODED=false in .env to disable.
"""

HARDCODED_BASE_URL = "https://pulse.salescode.ai"
HARDCODED_ORG = "demo"
HARDCODED_STREAM = "channelkart_logs"
HARDCODED_MAX_HITS = 51

# Full Cookie header from provided curl (jwt + sctoken + session cookies)
HARDCODED_COOKIE = (
    "_ga=GA1.1.1258474698.1779343212; "
    "_ga_8ESWZRL7DD=GS2.1.s1779362525$o1$g0$t1779362570$j15$l0$h0; "
    "jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc0FkbWluIjpmYWxzZSwiYWNjb3VudElkIjoiY2tjb2VkZW1vIiwibmFtZSI6IkZZTkFNSUNTIFRSQUlOSU5HIFNPTFVUSU9OUyBQUklWQVRFIExJTUlURUQgVFJBRElORyIsImVtYWlsIjoia3Jpc2gud2Fzb25Ac2FsZXNjb2RlLmFpIiwidXNlcm5hbWUiOiJHVDAxMDAwMjAxMTk5MjAwMDIwMTE5OTIiLCJsb2dPdXRVcmwiOiIiLCJpYXQiOjE3NzkzNjcyNTIsImV4cCI6MTc3OTQ1MzY1Miwic3ViIjoiR1QwMTAwMDIwMTE5OTIwMDAyMDExOTkyIn0.Ex28py1oCbRH07rQs7h8__fijLxOp6DsOOeXTQgj_bA; "
    "sctoken=Basic Y2tjb2VkZW1vOjphY2NvdW50c19yZWFkb25seV91c2VyOkFwcGxpY2F0ZTEyMyQ=; "
    "_ga_T96MFH4T4K=GS2.1.s1779364028$o3$g1$t1779368265$j60$l0$h0; "
    "ph_phc_y2fi5XJb7pYHGMUv6ggoJeCcA5dRg7XkjZzzJFpFCRBi_posthog=%7B%22%24device_id%22%3A%22019e2ed5-c03a-753e-ac44-2eb1b502cac9%22%2C%22distinct_id%22%3A%220091200036%22%2C%22%24sesid%22%3A%5B1779390330312%2C%22019e4bed-5d5b-77ff-8310-4d63876bf6a0%22%2C1779390307664%5D%2C%22%24epp%22%3Atrue%2C%22%24initial_person_info%22%3A%7B%22r%22%3A%22https%3A%2F%2Fcokeslk.salescode.ai%2Fdashboard%22%2C%22u%22%3A%22https%3A%2F%2Fcokeslk.salescode.ai%2FdashboardLogin%22%7D%2C%22%24user_state%22%3A%22identified%22%7D; "
    "_ga_GZSP6N1YNF=GS2.1.s1779390298$o2$g1$t1779390330$j28$l0$h0; "
    "_ga_TF2H1L0HR6=GS2.1.s1779429423$o8$g1$t1779430954$j55$l0$h0; "
    "auth_tokens=eyJhY2Nlc3NfdG9rZW4iOiJCYXNpYyBZV1J0YVc1QWMyRnNaWE5qYjJSbExtRnBPamx0STBZMFRrbHhPV2h0SkE9PSIsInJlZnJlc2hfdG9rZW4iOiIifQ==; "
    "ph_phc_x4r2EZf9mNc4JZoix6z3Vw9mXMM26BXrcWYgramBaGyF_posthog=%7B%22%24device_id%22%3A%22019d8622-9ae4-7baa-b1f5-dc7c2001b62c%22%2C%22distinct_id%22%3A%22CompanySupplier%22%2C%22%24sesid%22%3A%5Bnull%2Cnull%2Cnull%5D%2C%22%24epp%22%3Atrue%2C%22%24initial_person_info%22%3A%7B%22r%22%3A%22https%3A%2F%2Fcokeslkdemo.salescode.ai%2Fdashboard%22%2C%22u%22%3A%22https%3A%2F%2Fcokeslkdemo.salescode.ai%2FdashboardLogin%22%7D%2C%22%24user_state%22%3A%22identified%22%7D; "
    "screfreshtoken=daburdemo:LgaG3EYZ2OIfQlp+V5kLYKfpVq0vFstz4fA7tzJq7syhPdcC3ybKlVFyo4lJvqXtzgArwKY1XrR/a1UeH86eoHrkWQbQyHhG1ppLn0YIS2PHHKf/zzolSKb7MWMoHIJ70h4ukZA50OQ2auOLBkuG5uj6Cmx6XzLsnzYwsxksgXo="
)
