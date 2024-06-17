import makeFetchCookie from 'fetch-cookie'
import * as cheerio from "cheerio"
if (gameCode.startsWith("GS")) {
  const signinUrl = "https://store.play.net/Account/SignIn?returnURL=%2Fstore%2Fpurchase%2Fgs"
} else {
  const signinUrl = "https://store.play.net/Account/SignIn?returnURL=%2Fstore%2Fpurchase%2Fdr"
}
const claimReward = "https://store.play.net/Store/ClaimReward"

const fetchWithCookies = makeFetchCookie(fetch)

export async function getToken () {
  const rewriter = new HTMLRewriter()

  let token = ""

  const input = await fetchWithCookies(signinUrl)

  rewriter.on("[name='__RequestVerificationToken']", {
    element(element) {
      token = element.getAttribute("value") as string
    }
  }).transform(input)

  if (!token) {
    throw new Error("could not parse csrf token")
  }

  return token
}

export async function login (account: string, password : string) {
  const token = await getToken()

  const auth = new FormData()
  auth.set("UserName", account)
  auth.set("Password", password)
  auth.set("__RequestVerificationToken", token)

  const login = await fetchWithCookies(signinUrl, {
    method: "POST",
    body: auth,
  })

  const state = {
    authenticated_account: "",
    balance: "",
    next: "",
    cheerio: cheerio.load(await login.text()),
  }


  const authenticated_account = state.cheerio("#login").text()

  if (authenticated_account.toLowerCase().includes(account.toLowerCase())) {
    state.authenticated_account = account
  }

  if (!state.authenticated_account) {
    if (authenticated_account.toLowerCase().trim().includes("sign in")) {
      throw new Error(`account:${account} | password is probably wrong`)  
    }
    throw new Error(`account:${account} | something went wrong attempting to log in`)
  }

  state.next = state.cheerio(".RewardMessage").text()
  state.balance = state.cheerio(".balance > span").text()
  return state
}


export async function claimAccountRewards (account : string, password: string) {
  const state = await login(account, password)

  if (state.next.toLowerCase().startsWith("next subscription bonus")) {
    return {account, message: state.next, balance: state.balance}
  }
  
  const data = [...state.cheerio(`form[action='/Store/ClaimReward'] input`)]
  const form = new FormData()
  form.set("game", "GS")
  const claim = await fetchWithCookies(claimReward, {
    method: "POST",
    body: form,
  })

  const $ = cheerio.load(await claim.text())
  const message = $(".RewardMessage").text().toLowerCase()
  if (message.startsWith("claimed")) {
    return {account, message, balance: $(".balance > span").text()}
  }

  throw new Error(`account:${account} | something weird happened`)
}
