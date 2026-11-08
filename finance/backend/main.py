from datetime import date
from decimal import Decimal

from fastapi import FastAPI, HTTPException, Query, status, Response
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
import hmac
import mysql.connector
import json
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=1, max_length=255)


class BudgetCreate(BaseModel):
    user_id: int = Field(gt=0)
    category_id: int = Field(gt=0)
    budget_name: str = Field(min_length=1, max_length=100)
    budget_amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    start_date: date
    end_date: date


def get_connected():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="",
        database="finance_db",
    )

@app.get("/")
def tryConn():
    return "connected"

@app.get("/users")
def getUser():
    conn = get_connected()
    cursor = conn.cursor(dictionary = True)
    try:
        cursor.execute("select * from users;")
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@app.get("/accounts/{user_id}")
def getAccounts(user_id:int):
    conn = get_connected()
    cursor = conn.cursor(dictionary = True)
    cursor.execute(
        "SELECT * FROM accounts WHERE user_id = %s",
        (user_id,)
    )
    accounts = cursor.fetchall()
    cursor.close()
    return accounts


@app.post("/budgets", status_code=status.HTTP_201_CREATED)
def createBudget(budget: BudgetCreate):
    budget_name = budget.budget_name.strip()
    if not budget_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Budget name cannot be blank.",
        )
    if budget.end_date < budget.start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="End date must be on or after the start date.",
        )

    conn = get_connected()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT category_id FROM categories WHERE category_id = %s AND user_id = %s",
            (budget.category_id, budget.user_id),
        )
        if cursor.fetchone() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found for this user.",
            )

        cursor.execute(
            """
            INSERT INTO budgets
                (user_id, category_id, budget_name, budget_amount, start_date, end_date)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                budget.user_id,
                budget.category_id,
                budget_name,
                budget.budget_amount,
                budget.start_date,
                budget.end_date,
            ),
        )
        budget_id = cursor.lastrowid
        conn.commit()
        cursor.execute(
            """
            SELECT budget_id, user_id, category_id, budget_name, budget_amount,
                   start_date, end_date, created_at
            FROM budgets
            WHERE budget_id = %s AND user_id = %s
            """,
            (budget_id, budget.user_id),
        )
        created_budget = cursor.fetchone()
        if created_budget is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Budget was saved but could not be loaded.",
            )
        return created_budget
    finally:
        cursor.close()
        conn.close()


@app.put("/budgets/{user_id}/{budget_id}")
def updateBudget(user_id: int, budget_id: int, budget: BudgetCreate):
    if budget.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Budget user does not match the request.",
        )

    budget_name = budget.budget_name.strip()
    if not budget_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Budget name cannot be blank.",
        )
    if budget.end_date < budget.start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="End date must be on or after the start date.",
        )

    conn = get_connected()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT category_id FROM categories WHERE category_id = %s AND user_id = %s",
            (budget.category_id, user_id),
        )
        if cursor.fetchone() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found for this user.",
            )

        cursor.execute(
            """
            UPDATE budgets
            SET category_id = %s,
                budget_name = %s,
                budget_amount = %s,
                start_date = %s,
                end_date = %s
            WHERE budget_id = %s AND user_id = %s
            """,
            (
                budget.category_id,
                budget_name,
                budget.budget_amount,
                budget.start_date,
                budget.end_date,
                budget_id,
                user_id,
            ),
        )
        if cursor.rowcount == 0:
            cursor.execute(
                "SELECT budget_id FROM budgets WHERE budget_id = %s AND user_id = %s",
                (budget_id, user_id),
            )
            if cursor.fetchone() is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Budget not found.",
                )

        conn.commit()
        cursor.execute(
            """
            SELECT budget_id, user_id, category_id, budget_name, budget_amount,
                   start_date, end_date, created_at
            FROM budgets
            WHERE budget_id = %s AND user_id = %s
            """,
            (budget_id, user_id),
        )
        updated_budget = cursor.fetchone()
        if updated_budget is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Budget was saved but could not be loaded.",
            )
        return updated_budget
    finally:
        cursor.close()
        conn.close()


@app.delete("/budgets/{user_id}/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def deleteBudget(user_id: int, budget_id: int):
    conn = get_connected()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM budgets WHERE budget_id = %s AND user_id = %s",
            (budget_id, user_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Budget not found.",
            )
        conn.commit()
    finally:
        cursor.close()
        conn.close()


@app.post("/checkCredentials")
def checkAccount(credentials: LoginRequest):
    conn = get_connected()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT user_id, full_name, email, password_hash, profile_image, currency
            FROM users
            WHERE email = %s
            LIMIT 1
            """,
            (credentials.email.strip(),),
        )
        user = cursor.fetchone()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="This email is not registered.",
            )

        if not hmac.compare_digest(user["password_hash"], credentials.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password.",
            )

        # Never return password_hash to the client.
        return {
            "message": "Login successful",
            "user": {
                "user_id": user["user_id"],
                "full_name": user["full_name"],
                "email": user["email"],
                "profile_image": user["profile_image"],
                "currency": user["currency"],
            },
        }
    finally:
        cursor.close()
        conn.close()

@app.get("/resources/{user_id}")
def getResources(user_id: int):

    try:
        conn = get_connected()
        cursor = conn.cursor(dictionary=True)

        query = """
        SELECT
            u.user_id,
            u.full_name,
            u.email,
            u.role,

            COALESCE(a.accounts, '[]') AS accounts,
            COALESCE(c.categories, '[]') AS categories,
            COALESCE(b.bills, '[]') AS bills,
            COALESCE(bu.budgets, '[]') AS budgets,
            COALESCE(t.transactions, '[]') AS transactions,
            COALESCE(sg.savings_goals, '[]') AS savings_goals,
            COALESCE(gc.contributions, '[]') AS goal_contributions,
            COALESCE(rt.recurring_transactions, '[]') AS recurring_transactions,
            COALESCE(n.notifications, '[]') AS notifications

        FROM users u

        LEFT JOIN (
            SELECT user_id,
                CONCAT('[', COALESCE(GROUP_CONCAT(
                    JSON_OBJECT(
                        'account_id', account_id,
                        'account_name', account_name,
                        'account_type', account_type,
                        'balance', initial_balance
                    )
                ), ''), ']') AS accounts
            FROM accounts
            GROUP BY user_id
        ) a ON a.user_id = u.user_id

        LEFT JOIN (
            SELECT user_id,
                CONCAT('[', COALESCE(GROUP_CONCAT(
                    JSON_OBJECT(
                        'category_id', category_id,
                        'category_name', category_name,
                        'category_type', category_type,
                        'icon', icon,
                        'color', color
                    )
                ), ''), ']') AS categories
            FROM categories
            GROUP BY user_id
        ) c ON c.user_id = u.user_id

        LEFT JOIN (
            SELECT user_id,
                CONCAT('[', COALESCE(GROUP_CONCAT(
                    JSON_OBJECT(
                        'bill_id', bill_id,
                        'bill_name', bill_name,
                        'amount', amount,
                        'due_date', due_date,
                        'status', status
                    )
                ), ''), ']') AS bills
            FROM bills
            GROUP BY user_id
        ) b ON b.user_id = u.user_id

        LEFT JOIN (
            SELECT user_id,
                CONCAT('[', COALESCE(GROUP_CONCAT(
                    JSON_OBJECT(
                        'budget_id', budget_id,
                        'category_id', category_id,
                        'budget_name', budget_name,
                        'budget_amount', budget_amount,
                        'start_date', start_date,
                        'end_date', end_date,
                        'created_at', created_at
                    )
                ), ''), ']') AS budgets
            FROM budgets
            GROUP BY user_id
        ) bu ON bu.user_id = u.user_id

        LEFT JOIN (
            SELECT user_id,
                CONCAT('[', COALESCE(GROUP_CONCAT(
                    JSON_OBJECT(
                        'transaction_id', transaction_id,
                        'account_id', account_id,
                        'category_id', category_id,
                        'transaction_type', transaction_type,
                        'amount', amount,
                        'description', description,
                        'transaction_date', transaction_date
                    )
                ), ''), ']') AS transactions
            FROM transactions
            GROUP BY user_id
        ) t ON t.user_id = u.user_id

        LEFT JOIN (
            SELECT user_id,
                CONCAT('[', COALESCE(GROUP_CONCAT(
                    JSON_OBJECT(
                        'goal_id', goal_id,
                        'goal_name', goal_name,
                        'target_amount', target_amount,
                        'target_date', target_date,
                        'status', status
                    )
                ), ''), ']') AS savings_goals
            FROM savings_goals
            GROUP BY user_id
        ) sg ON sg.user_id = u.user_id

        LEFT JOIN (
            SELECT
                s.user_id,
                CONCAT('[', COALESCE(GROUP_CONCAT(
                    JSON_OBJECT(
                        'contribution_id', gc.contribution_id,
                        'goal_id', gc.goal_id,
                        'goal_name', s.goal_name,
                        'amount', gc.amount,
                        'contribution_date', gc.contribution_date,
                        'notes', gc.notes
                    )
                ), ''), ']') AS contributions
            FROM goal_contributions gc
            INNER JOIN savings_goals s
                ON s.goal_id = gc.goal_id
            GROUP BY s.user_id
        ) gc ON gc.user_id = u.user_id

        LEFT JOIN (
            SELECT user_id,
                CONCAT('[', COALESCE(GROUP_CONCAT(
                    JSON_OBJECT(
                        'recurring_id', recurring_id,
                        'account_id', account_id,
                        'category_id', category_id,
                        'transaction_type', transaction_type,
                        'description', description,
                        'amount', amount,
                        'frequency', frequency,
                        'start_date', start_date,
                        'next_due_date', next_due_date,
                        'is_active', is_active
                    )
                ), ''), ']') AS recurring_transactions
            FROM recurring_transactions
            GROUP BY user_id
        ) rt ON rt.user_id = u.user_id

        LEFT JOIN (
            SELECT user_id,
                CONCAT('[', COALESCE(GROUP_CONCAT(
                    JSON_OBJECT(
                        'notification_id', notification_id,
                        'title', title,
                        'message', message,
                        'notification_type', notification_type,
                        'is_read', is_read
                    )
                ), ''), ']') AS notifications
            FROM notifications
            GROUP BY user_id
        ) n ON n.user_id = u.user_id

        WHERE u.user_id = %s;
        """

        cursor.execute(query, (user_id,))

        result = cursor.fetchone()

        if not result:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )

        # Convert JSON strings into Python lists
        json_columns = [
            "accounts",
            "categories",
            "bills",
            "budgets",
            "transactions",
            "savings_goals",
            "goal_contributions",
            "recurring_transactions",
            "notifications"
        ]

        for column in json_columns:
            result[column] = json.loads(result[column])

        return result

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

    finally:
        if 'cursor' in locals():
            cursor.close()

        if 'conn' in locals():
            conn.close()
@app.get("/transactionFilter/{user_id}")
def transactionFilter(user_id: int,):
    conn = get_connected()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
              """
              SELECT transaction_type, amount, description,
                     transaction_date, notes
              FROM transactions
              WHERE user_id = %s
              """,
              (user_id,),
          )
        return cursor.fetchall()
    finally:
          cursor.close()
          conn.close()

@app.get("/transactionFilter/{user_id}/{transaction_type}")
def transactionFilter(user_id: int,transaction_type: str,):
    conn = get_connected()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
              """
              SELECT transaction_type, amount, description,
                     transaction_date, notes
              FROM transactions
              WHERE user_id = %s AND transaction_type = %s
              """,
              (user_id,transaction_type),
          )
        return cursor.fetchall()
    finally:
          cursor.close()
          conn.close()

@app.get("/transactionSearch/{user_id}")
def searchTransactions(user_id: int, search_term: str = Query(min_length=1, max_length=100)):
    normalized_search_term = search_term.strip()
    if not normalized_search_term:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Search term cannot be blank.",
        )

    search_pattern = f"%{normalized_search_term}%"
    conn = get_connected()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT transaction_type, amount, description,
                   transaction_date, notes
            FROM transactions
            WHERE user_id = %s
              AND (
                  description LIKE %s
                  OR transaction_type LIKE %s
                  OR COALESCE(notes, '') LIKE %s
                  OR CAST(amount AS CHAR) LIKE %s
                  OR CAST(transaction_date AS CHAR) LIKE %s
              )
            """,
            (user_id, search_pattern, search_pattern, search_pattern, search_pattern, search_pattern),
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

##for date asc and desc 
@app.get("/transactionFilter/{user_id}/{isorder}/{order}")
def transactionFilter(user_id: int,isorder: bool,order: str):
    conn = get_connected()
    cursor = conn.cursor(dictionary=True)
    
    if (isorder == True and order =="oldest"):
        try:
        
            cursor.execute(
              """
              SELECT transaction_type, amount, description,
                     transaction_date, notes
              FROM transactions
              WHERE user_id = %s 
              ORDER by transaction_date ASC
              """,
              (user_id,),
          )
            return cursor.fetchall()
        finally:
          cursor.close()
          conn.close()


    elif (isorder == True and order =="newest"):
            try:
            
                cursor.execute(
                  """
                  SELECT transaction_type, amount, description,
                         transaction_date, notes
                  FROM transactions
                  WHERE user_id = %s 
                  ORDER by transaction_date DESC
                  """,
                  (user_id,),
              )
                return cursor.fetchall()
            finally:
              cursor.close()
              conn.close()
    elif (isorder == True and order =="a-z"):
            try:
            
                cursor.execute(
                  """
                  SELECT transaction_type, amount, description,
                         transaction_date, notes
                  FROM transactions
                  WHERE user_id = %s 
                  ORDER by description ASC
                  """,
                  (user_id,),
              )
                return cursor.fetchall()
            finally:
              cursor.close()
              conn.close()
    elif (isorder == True and order =="z-a"):
            try:
                cursor.execute(
                    """
                    SELECT transaction_type, amount, description,
                           transaction_date, notes
                    FROM transactions
                    WHERE user_id = %s 
                    ORDER by description DESC
                    """,
                    (user_id,),
                )
                return cursor.fetchall()
            finally:
                  cursor.close()
                  conn.close()
    elif (isorder == True and order =="highest"):
            try:         
                cursor.execute(
                    """
                    SELECT transaction_type, amount, description,
                           transaction_date, notes
                    FROM transactions
                    WHERE user_id = %s 
                    ORDER by amount DESC
                    """,
                    (user_id,),
                )
                return cursor.fetchall()
            finally:
                cursor.close()
                conn.close()
    elif (isorder == True and order =="lowest"):
            try:
            
                cursor.execute(
                    """
                    SELECT transaction_type, amount, description,
                           transaction_date, notes
                    FROM transactions
                    WHERE user_id = %s 
                    ORDER by amount ASC
                    """,
                    (user_id,),
                )
                return cursor.fetchall()
            finally:
                cursor.close()
                conn.close()
    else: return "Invalid API"
@app.get("/budget/{user_id}")
def budget(user_id: int,):
    conn = get_connected()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
              """
              SELECT budget_id, category_id, budget_name, budget_amount,
                     start_date, end_date, created_at
              FROM budgets
              WHERE user_id = %s
              """,
              (user_id,),
          )
        return cursor.fetchall()
    finally:
          cursor.close()
          conn.close()
@app.get("/.well-known/appspecific/com.chrome.devtools.json")
async def chrome_devtools():
    return Response(status_code=204)
