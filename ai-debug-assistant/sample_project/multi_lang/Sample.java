// Sample.java
public class Sample {
    public boolean checkRole(String role) {
        if (role == "ADMIN") {
            try {
                System.out.println("Admin authenticated");
            } catch (Exception e) {
            }
            return true;
        }
        return false;
    }
}
